import { browserLegacy, defaultKv, type Kv, type LegacyStore } from "./idb";

export type SyncCollection = "history" | "uploads";

interface Row {
  id: string;
  createdAt: number;
}

export interface Synced<T extends Row> {
  /** This account's shelf: the server's copy once this device has synced, and
      the server merged with what the device already held the first time. */
  load(): Promise<T[]>;
  /** Writes the device cache now and sends the difference to the server soon. */
  save(rows: T[]): Promise<void>;
}

interface SyncConfig<T extends Row> {
  collection: SyncCollection;
  userId: string;
  readLocal: (kv: Kv, legacy: LegacyStore | undefined) => Promise<T[]>;
  writeLocal: (rows: T[], kv: Kv, legacy: LegacyStore | undefined) => Promise<void>;
  merge: (stored: T[], live: T[]) => T[];
  /** Server rows are untrusted input: keep only what the shelf's own reader accepts. */
  coerce: (rows: unknown[]) => T[];
}

const CLAIM_KEY = "legacy-claimed.v1";
const PUSH_DELAY_MS = 500;
const PUSH_CHUNK = 50;

/* The device cache is kept per account, so signing out and in as someone else
   never shows — or uploads — the previous person's shelf. The unscoped copy
   from before accounts existed is handed to the first account that signs in. */
const NO_LEGACY: LegacyStore = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function scopedKv(kv: Kv, userId: string): Kv {
  return {
    get: <V>(key: string) => kv.get<V>(`${userId}:${key}`),
    set: (key, value) => kv.set(`${userId}:${key}`, value),
  };
}

export function createSynced<T extends Row>(config: SyncConfig<T>): Synced<T> {
  const { collection, userId } = config;
  const raw = defaultKv();
  const local = scopedKv(raw, userId);
  const syncedKey = `synced.${collection}`;

  /* What the server holds, as the stable text of each row. Pushing sends the
     rows that differ and removes only ids this device has seen on the server,
     so a stale tab can never delete — or overwrite — what another device added. */
  const known = new Map<string, string>();
  let latest: T[] = [];
  let loaded = false;
  let remoteOk = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<void> = Promise.resolve();

  async function load(): Promise<T[]> {
    const cached = await config.readLocal(local, NO_LEGACY);
    let remote: T[];
    try {
      remote = config.coerce(await pull(collection));
    } catch {
      /* Offline or the database is down: keep working from this device. */
      loaded = true;
      return cached;
    }
    known.clear();
    for (const row of remote) known.set(row.id, stable(row));
    remoteOk = true;
    loaded = true;

    if ((await local.get<boolean>(syncedKey)) === true) return remote;

    const claimed = await raw.get<string>(CLAIM_KEY);
    let inherited: T[] = [];
    if (claimed === undefined || claimed === userId) {
      inherited = await config.readLocal(raw, browserLegacy());
      if (claimed === undefined) await raw.set(CLAIM_KEY, userId).catch(() => {});
    }
    return config.merge(config.merge(remote, cached), inherited);
  }

  async function save(rows: T[]): Promise<void> {
    latest = rows;
    await config.writeLocal(rows, local, NO_LEGACY);
    if (!loaded) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      chain = chain.then(push).catch(() => {});
    }, PUSH_DELAY_MS);
  }

  async function push(): Promise<void> {
    const rows = latest;
    const ids = new Set(rows.map((row) => row.id));
    const upsert = rows.filter((row) => known.get(row.id) !== stable(row));
    const remove = [...known.keys()].filter((id) => !ids.has(id));

    for (let at = 0; at < Math.max(upsert.length, 1); at += PUSH_CHUNK) {
      const chunk = upsert.slice(at, at + PUSH_CHUNK);
      if (chunk.length === 0 && remove.length === 0) break;
      const res = await fetch(`/api/sync/${collection}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ upsert: chunk, remove: at === 0 ? remove : [] }),
      });
      if (!res.ok) throw new Error(`Sync failed (${res.status})`);
      for (const row of chunk) known.set(row.id, stable(row));
      if (at === 0) for (const id of remove) known.delete(id);
    }
    if (remoteOk) await local.set(syncedKey, true).catch(() => {});
  }

  return { load, save };
}

async function pull(collection: SyncCollection): Promise<unknown[]> {
  const res = await fetch(`/api/sync/${collection}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Sync failed (${res.status})`);
  const body = (await res.json()) as { records?: unknown };
  if (!Array.isArray(body.records)) throw new Error("Sync returned no records");
  return body.records;
}

/** JSON with sorted keys: Postgres hands jsonb back in its own key order, and
    a row must not look changed just because it round-tripped. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner === null || typeof inner !== "object" || Array.isArray(inner)) return inner;
    const entries = Object.entries(inner as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return Object.fromEntries(entries);
  });
}
