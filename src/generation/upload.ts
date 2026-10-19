import { put } from "@vercel/blob/client";

export async function uploadMedia(file: File): Promise<{ url: string }> {
  const res = await fetch("/api/blob", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: { pathname: file.name, clientPayload: null, multipart: false },
    }),
  });
  if (!res.ok) throw new Error(await tokenFailure(res));
  const { clientToken, pathname } = (await res.json()) as {
    clientToken?: unknown;
    pathname?: unknown;
  };
  if (typeof clientToken !== "string" || typeof pathname !== "string") {
    throw new Error("Failed to retrieve the client token");
  }
  const blob = await put(pathname, file, { access: "public", token: clientToken });
  return { url: blob.url };
}

/** The route says why it refused; a signed-out session is the one the visitor
    can fix themselves, so it is named rather than passed off as a Blob fault. */
async function tokenFailure(res: Response): Promise<string> {
  if (res.status === 401) return "Your session ended — sign in again";
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : "Failed to retrieve the client token";
}
