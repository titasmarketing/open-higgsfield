import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { applyChanges, isSyncCollection, listRecords, type SyncRow } from "@/server/db";

const MAX_UPSERT = 100;
const MAX_REMOVE = 500;
const MAX_ROW_BYTES = 64 * 1024;

type Context = { params: Promise<{ collection: string }> };

export async function GET(_request: Request, { params }: Context): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to sync" }, { status: 401 });
  const { collection } = await params;
  if (!isSyncCollection(collection)) {
    return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
  }
  try {
    const records = await listRecords(userId, collection);
    return NextResponse.json({ records }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure("list", error);
  }
}

export async function POST(request: Request, { params }: Context): Promise<NextResponse> {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to sync" }, { status: 401 });
  const { collection } = await params;
  if (!isSyncCollection(collection)) {
    return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
  }

  const changes = parseChanges(await request.json().catch(() => null));
  if (!changes) return NextResponse.json({ error: "Malformed changes" }, { status: 400 });

  try {
    await applyChanges(userId, collection, changes.upsert, changes.remove);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("apply", error);
  }
}

function parseChanges(body: unknown): { upsert: SyncRow[]; remove: string[] } | null {
  if (body === null || typeof body !== "object") return null;
  const { upsert = [], remove = [] } = body as { upsert?: unknown; remove?: unknown };
  if (!Array.isArray(upsert) || !Array.isArray(remove)) return null;
  if (upsert.length > MAX_UPSERT || remove.length > MAX_REMOVE) return null;
  if (!remove.every((id) => typeof id === "string" && id.length > 0 && id.length <= 200)) {
    return null;
  }
  if (!upsert.every(isSyncRow)) return null;
  return { upsert, remove };
}

function isSyncRow(value: unknown): value is SyncRow {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Partial<SyncRow>;
  return (
    typeof row.id === "string" &&
    row.id.length > 0 &&
    row.id.length <= 200 &&
    typeof row.createdAt === "number" &&
    Number.isFinite(row.createdAt) &&
    JSON.stringify(row).length <= MAX_ROW_BYTES
  );
}

function failure(step: string, error: unknown): NextResponse {
  console.error(`[sync] ${step} failed`, error instanceof Error ? error.message : error);
  return NextResponse.json({ error: "Sync is unavailable" }, { status: 500 });
}
