import { neon } from "@neondatabase/serverless";

/** The two shelves a signed-in visitor carries between devices. */
export const SYNC_COLLECTIONS = ["history", "uploads"] as const;
export type SyncCollection = (typeof SYNC_COLLECTIONS)[number];

export function isSyncCollection(value: string): value is SyncCollection {
  return (SYNC_COLLECTIONS as readonly string[]).includes(value);
}

export interface SyncRow {
  id: string;
  createdAt: number;
  [key: string]: unknown;
}

const LIST_LIMIT = 500;

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");
  return neon(url);
}

/* One table for both shelves: a row is the visitor's record as the browser
   wrote it, keyed by who owns it and which shelf it sits on. Created on first
   use so a fresh database needs no migration step. */
let schema: Promise<void> | undefined;

function ensureSchema(): Promise<void> {
  schema ??= (async () => {
    const sql = client();
    await sql`
      create table if not exists ohf_records (
        user_id text not null,
        collection text not null,
        id text not null,
        data jsonb not null,
        created_at bigint not null,
        primary key (user_id, collection, id)
      )
    `;
    await sql`
      create index if not exists ohf_records_recent
        on ohf_records (user_id, collection, created_at desc)
    `;
  })().catch((error: unknown) => {
    schema = undefined;
    throw error;
  });
  return schema;
}

export async function listRecords(userId: string, collection: SyncCollection): Promise<unknown[]> {
  await ensureSchema();
  const sql = client();
  const rows = await sql`
    select data from ohf_records
    where user_id = ${userId} and collection = ${collection}
    order by created_at desc
    limit ${LIST_LIMIT}
  `;
  return rows.map((row) => row.data as unknown);
}

export async function applyChanges(
  userId: string,
  collection: SyncCollection,
  upsert: SyncRow[],
  remove: string[],
): Promise<void> {
  await ensureSchema();
  const sql = client();
  if (upsert.length > 0) {
    const batch = upsert.map((row) => ({
      id: row.id,
      createdAt: Math.trunc(row.createdAt),
      data: row,
    }));
    await sql`
      insert into ohf_records (user_id, collection, id, data, created_at)
      select ${userId}, ${collection}, item->>'id', item->'data', (item->>'createdAt')::bigint
      from jsonb_array_elements(${JSON.stringify(batch)}::jsonb) as item
      on conflict (user_id, collection, id)
      do update set data = excluded.data, created_at = excluded.created_at
    `;
  }
  if (remove.length > 0) {
    await sql`
      delete from ohf_records
      where user_id = ${userId} and collection = ${collection}
        and id in (select jsonb_array_elements_text(${JSON.stringify(remove)}::jsonb))
    `;
  }
}
