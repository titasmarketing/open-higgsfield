import { auth } from "@clerk/nextjs/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { blobPathname } from "@/generation/blob-path";

export async function POST(request: Request): Promise<NextResponse> {
  const incoming = (await request.json()) as HandleUploadBody;

  /* Only the token request comes from a signed-in browser. The completion
     event comes from Blob itself and is checked by the SDK's own signature. */
  let body = incoming;
  if (incoming.type === "blob.generate-client-token") {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in to upload" }, { status: 401 });
    body = {
      ...incoming,
      payload: {
        ...incoming.payload,
        pathname: blobPathname(userId, incoming.payload.pathname),
      },
    };
  }
  console.info("[blob] upload", summarizeBlobEvent(body));

  const token = process.env.OPEN_HIGGSFIELD_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.error("[blob] missing OPEN_HIGGSFIELD_READ_WRITE_TOKEN or BLOB_READ_WRITE_TOKEN");
    return NextResponse.json({ error: "Blob storage is not configured" }, { status: 500 });
  }

  try {
    const json = await handleUpload({
      body,
      request,
      token,
      onBeforeGenerateToken: async (pathname) => {
        console.info("[blob] token", { pathname });
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "video/mp4",
            "audio/wav",
            "audio/x-wav",
          ],
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(
      json.type === "blob.generate-client-token" && body.type === "blob.generate-client-token"
        ? { ...json, pathname: body.payload.pathname }
        : json,
    );
  } catch (error) {
    console.error("[blob] upload failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Upload could not be authorised" }, { status: 500 });
  }
}

function summarizeBlobEvent(body: HandleUploadBody) {
  if (body.type === "blob.generate-client-token") {
    return { type: body.type, pathname: body.payload.pathname };
  }
  return { type: body.type, url: body.payload.blob.url };
}
