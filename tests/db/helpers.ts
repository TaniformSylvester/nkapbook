import "./pg-types";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { testUrl } from "./global-setup";

export type Role = "anon" | "authenticated" | "service_role";

/** A connection that runs each call inside a transaction as a given Supabase role. */
export class Db {
  private constructor(private client: Client) {}

  static async connect() {
    const c = new Client({ connectionString: testUrl() });
    await c.connect();
    return new Db(c);
  }

  end() {
    return this.client.end();
  }

  /** Run SQL as superuser (test setup only). */
  async admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    return (await this.client.query(sql, params)).rows as T[];
  }

  /** Run SQL as a role, with an optional signed-in user. Rolls back afterwards unless commit=true. */
  async as<T = Record<string, unknown>>(
    who: { role: Role; userId?: string },
    sql: string,
    params: unknown[] = [],
    commit = false,
  ): Promise<T[]> {
    const c = this.client;
    await c.query("begin");
    try {
      await c.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify(who.userId ? { sub: who.userId, role: who.role } : { role: who.role }),
      ]);
      await c.query(`set local role ${who.role}`);
      const res = await c.query(sql, params);
      await c.query(commit ? "commit" : "rollback");
      return res.rows as T[];
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  }

  user(userId: string) {
    return {
      q: <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
        this.as<T>({ role: "authenticated", userId }, sql, params),
      commit: <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
        this.as<T>({ role: "authenticated", userId }, sql, params, true),
    };
  }

  async createUser(phone: string) {
    const id = randomUUID();
    await this.admin(`insert into auth.users (id, phone) values ($1, $2)`, [id, phone]);
    return id;
  }
}

let n = Math.floor(Math.random() * 1e6);
/** Unique Cameroon mobile number for tests: 2376 + 8 digits. */
export function phone() {
  n += 1;
  return `2376${String(n % 1e8).padStart(8, "0")}`;
}
