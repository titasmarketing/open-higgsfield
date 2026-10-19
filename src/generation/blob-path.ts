const OWNER_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** Uploads live under their owner's id, so one account's files never share a
    prefix with another's. */
export function blobPathname(ownerId: string, filename: string): string {
  if (!OWNER_ID_RE.test(ownerId)) throw new Error("Invalid owner id");
  return `${ownerId}/${sanitizeFilename(filename)}`;
}

function sanitizeFilename(filename: string): string {
  const base = filename.replaceAll("\\", "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "");
  return cleaned.slice(0, 180) || "file";
}
