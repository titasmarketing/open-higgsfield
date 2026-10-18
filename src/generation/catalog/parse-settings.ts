import type { ModelEntry } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSettings(
  model: ModelEntry,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(model.settings)) {
    const value = raw[key];
    if (field.type === "enum") {
      const picked = typeof value === "string" ? value : field.default;
      if (!field.values.includes(picked)) throw new Error(`Invalid ${key}`);
      out[key] = picked;
      continue;
    }
    if (field.type === "range") {
      const picked = typeof value === "number" ? value : field.default;
      if (picked < field.min || picked > field.max) throw new Error(`Invalid ${key}`);
      out[key] = picked;
      continue;
    }
    if (field.type === "text") {
      const picked = typeof value === "string" ? value : field.default;
      if (picked.length > field.maxLength) throw new Error(`Invalid ${key}`);
      out[key] = picked;
      continue;
    }
    if (field.type === "preset") {
      const picked = typeof value === "string" ? value : "";
      if (picked && !UUID.test(picked)) throw new Error(`Invalid ${key}`);
      out[key] = picked;
      continue;
    }
    out[key] = typeof value === "boolean" ? value : field.default;
  }
  return out;
}
