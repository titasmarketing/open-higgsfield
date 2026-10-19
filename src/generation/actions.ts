"use server";

import { cookies } from "next/headers";

import type { ActionResult } from "./action-result";
import { getModel, parseSettings } from "./catalog";
import type { GenerationPlane } from "./catalog/types";
import {
  MissingCredentialsError,
  PLATFORM_KEY_COOKIE,
  PLATFORM_KEY_COOKIE_OPTIONS,
  decodeCredentials,
  encodeCredentials,
  parseCredentialInput,
} from "./credentials";
import { createPlatformClient } from "./platform";
import type { MarketingPreset, StatusResult } from "./platform";
import { toPlatform } from "./to-platform";

async function saveCredentials(data: unknown) {
  const { apiKey } = parseCredentialInput(data);
  const jar = await cookies();
  jar.set(PLATFORM_KEY_COOKIE, encodeCredentials(apiKey), PLATFORM_KEY_COOKIE_OPTIONS);
}

/* Production hides the message of anything a server action throws, so every
   failure the visitor can act on travels back as a value instead — and is
   logged here, where the full reason is still known. */
export async function savePlatformCredentials(data: unknown): Promise<ActionResult<void>> {
  return attempt("save key", () => saveCredentials(data));
}

export async function submitGeneration(plane: GenerationPlane) {
  return attempt("submit", () => submit(plane));
}

export async function listMarketingPresets(): Promise<ActionResult<MarketingPreset[]>> {
  return attempt("list presets", presets);
}

export async function getGenerationStatuses(data: unknown): Promise<ActionResult<StatusResult[]>> {
  return attempt("status", () => statuses(data));
}

async function attempt<T>(step: string, run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (caught) {
    if (caught instanceof MissingCredentialsError) {
      return { ok: false, error: caught.message, code: "missing-key" };
    }
    const error = caught instanceof Error ? caught.message : "Unexpected server error";
    console.error(`[actions] ${step} failed`, error);
    return { ok: false, error };
  }
}

export async function clearPlatformCredentials() {
  const jar = await cookies();
  jar.set(PLATFORM_KEY_COOKIE, "", { ...PLATFORM_KEY_COOKIE_OPTIONS, maxAge: 0 });
}

export async function hasPlatformCredentials() {
  return (await readStoredCredentials()) !== null;
}

async function submit(plane: GenerationPlane) {
  const model = getModel(plane.model);
  const parsed: GenerationPlane = {
    ...plane,
    settings: parseSettings(model, plane.settings),
  };
  if (!model.promptOptional && !parsed.prompt.text.trim()) throw new Error("Write a prompt first");
  const blocked = model.check?.(parsed);
  if (blocked) throw new Error(blocked);
  const { path, body } = toPlatform(parsed);
  return createPlatformClient(await readCredentials()).submit(path, body);
}

/** Every visible Marketing Studio preset, all pages, in catalog order. */
async function presets(): Promise<MarketingPreset[]> {
  const client = createPlatformClient(await readCredentials());
  const all: MarketingPreset[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const next = await client.marketingPresets(cursor);
    all.push(...next.items);
    if (!next.cursor || next.cursor === cursor) break;
    cursor = next.cursor;
  }
  return all;
}

/** Every request in flight, answered in one round trip. Next dispatches server
    actions one at a time per client, so a poll per run would queue ahead of the
    next submit — the fan-out belongs on this side of the call, where it is
    genuinely parallel. */
async function statuses(data: unknown): Promise<StatusResult[]> {
  const requestIds = parseRequestIds(data);
  const client = createPlatformClient(await readCredentials());
  return Promise.all(
    requestIds.map(async (requestId): Promise<StatusResult> => {
      try {
        return { requestId, status: await client.status(requestId) };
      } catch (caught) {
        return { requestId, error: caught instanceof Error ? caught.message : String(caught) };
      }
    }),
  );
}

async function readStoredCredentials() {
  const jar = await cookies();
  return decodeCredentials(jar.get(PLATFORM_KEY_COOKIE)?.value);
}

async function readCredentials() {
  const stored = await readStoredCredentials();
  if (!stored) throw new MissingCredentialsError();
  const baseUrl = process.env.HF_API_BASE_URL;
  if (!baseUrl) throw new Error("Missing HF_API_BASE_URL");
  return { ...stored, baseUrl };
}

function parseRequestIds(data: unknown): string[] {
  const payload = asObject(data, "Invalid status payload");
  const requestIds = payload.requestIds;
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    throw new Error("Invalid request ids");
  }
  return requestIds.map((requestId) => {
    if (typeof requestId !== "string" || !requestId) throw new Error("Invalid request id");
    return requestId;
  });
}

function asObject(data: unknown, message: string): Record<string, unknown> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error(message);
  return data as Record<string, unknown>;
}
