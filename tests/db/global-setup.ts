import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Admin connection to a local Postgres (superuser). A throwaway database is
// created for each run, so this never touches real data.
export const ADMIN_URL = process.env.TEST_PG_ADMIN_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
export const TEST_DB = "nkapbook_test";

export default async function setup() {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();

  const db = new Client({ connectionString: testUrl() });
  await db.connect();
  const root = path.resolve(import.meta.dirname, "../..");
  await db.query(readFileSync(path.join(root, "tests/db/supabase-shim.sql"), "utf8"));
  const dir = path.join(root, "supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.query(readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
    }
  }
  await db.end();
}

export function testUrl() {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${TEST_DB}`;
  return u.toString();
}
