"use client";
import { openDB, type IDBPDatabase } from "idb";
import type { QueuedOp, Snapshot } from "./types";

// Everything recorded in meeting mode lives here first, then syncs.
type Schema = {
  snapshots: { key: string; value: Snapshot };
  ops: { key: string; value: QueuedOp & { seq: number }; indexes: { meeting: string } };
};

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
function db() {
  dbp ??= openDB<Schema>("nkapbook", 1, {
    upgrade(d) {
      d.createObjectStore("snapshots");
      const ops = d.createObjectStore("ops", { keyPath: "id" });
      ops.createIndex("meeting", "meeting_id");
    },
  });
  return dbp;
}

export async function saveSnapshot(s: Snapshot) {
  await (await db()).put("snapshots", s, s.meeting.id);
}
export async function loadSnapshot(meetingId: string) {
  return (await db()).get("snapshots", meetingId);
}

export async function enqueue(op: QueuedOp) {
  await (await db()).put("ops", { ...op, seq: Date.now() + Math.random() });
}
export async function listOps(meetingId: string): Promise<QueuedOp[]> {
  const all = await (await db()).getAllFromIndex("ops", "meeting", meetingId);
  return all.sort((a, b) => a.seq - b.seq);
}
export async function markOps(results: { id: string; ok: boolean; error?: string }[]) {
  const tx = (await db()).transaction("ops", "readwrite");
  for (const r of results) {
    const op = await tx.store.get(r.id);
    if (!op) continue;
    if (r.ok) await tx.store.put({ ...op, synced: true, error: undefined });
    else await tx.store.put({ ...op, error: r.error ?? "error" });
  }
  await tx.done;
}
/** Drop ops the server has confirmed, once a fresh snapshot that includes them is saved. */
export async function dropSynced(meetingId: string) {
  const tx = (await db()).transaction("ops", "readwrite");
  for (const op of await tx.store.index("meeting").getAll(meetingId)) if (op.synced) await tx.store.delete(op.id);
  await tx.done;
}
export async function removeOp(id: string) {
  await (await db()).delete("ops", id);
}
