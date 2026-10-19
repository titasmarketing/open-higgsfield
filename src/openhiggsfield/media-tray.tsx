"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { MediaItem, MediaRole, ModelEntry } from "@/generation/catalog";
import { useImageMedia, useVideoMedia } from "@/generation/stores/media";
import { uploadMedia } from "@/generation/upload";

import { ROLE_ACCEPT, ROLE_LABELS, ROLE_TAGS, rolesOf } from "./data";
import { AudioIcon, CloseIcon, VideoIcon } from "./icons";
import { useStores } from "./stores";
import { kindOfFile, mergeUploads, rememberUpload, type UploadRecord } from "./uploads";

function useMedia(model: ModelEntry) {
  const imageMedia = useImageMedia();
  const videoMedia = useVideoMedia();
  return model.surface === "image" ? imageMedia : videoMedia;
}

export interface MediaTray {
  roles: MediaRole[];
  /** The current surface's attachments, so the picker can derive its own caps
      from the same list the strip below renders. */
  items: MediaItem[];
  /** Every file this browser has sent to Blob, newest first. */
  uploads: UploadRecord[];
  /** The files of the last batch uploaded from the picker, in the order they
      were chosen. They go onto the shelf and into the panel's selection, not
      onto the plane — the panel stages the whole set and one press applies it. */
  staged: StagedBatch | null;
  uploading: boolean;
  /** How far the batch in flight has got, for the picker to state. */
  progress: { done: number; total: number } | null;
  allFull: boolean;
  /** Hidden file input; render it once inside the composer. */
  input: ReactNode;
  /** Set the role the next files take, then open the OS picker. */
  begin: (role: MediaRole) => void;
  /** Make the role's inputs exactly these URLs — the picker hands back the set
      it edited, so one press both attaches and detaches. */
  apply: (role: MediaRole, urls: string[]) => void;
}

/** One pick from the OS dialog. The id tells a new batch from one the picker
    has already taken in, even when the same files are chosen twice. */
export interface StagedBatch {
  id: number;
  urls: string[];
}

/* Enough in flight to fill the pipe, few enough that a dozen large videos do
   not each crawl at a twelfth of the uplink. */
const UPLOAD_CONCURRENCY = 3;

export function useMediaTray(
  model: ModelEntry,
  onError: (message: string | null) => void,
): MediaTray {
  const media = useMedia(model);
  const { uploads: uploadsStore } = useStores();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [staged, setStaged] = useState<StagedBatch | null>(null);
  const [uploadsLoaded, setUploadsLoaded] = useState(false);
  const roleRef = useRef<MediaRole>("reference");
  const inputRef = useRef<HTMLInputElement>(null);

  /* Read once, then write back on every change — the same order history takes,
     and for the same reason: writing before the read has landed would persist
     the empty initial value over the stored shelf. */
  useEffect(() => {
    let live = true;
    void uploadsStore.load()
      .then((rows) => {
        if (!live) return;
        setUploads((current) => mergeUploads(rows, current));
        setUploadsLoaded(true);
      })
      .catch(() => {
        if (live) setUploadsLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [uploadsStore]);
  useEffect(() => {
    if (uploadsLoaded) void uploadsStore.save(uploads);
  }, [uploadsStore, uploadsLoaded, uploads]);

  const roles = rolesOf(model);
  const counts: Record<string, number> = {};
  for (const role of roles) {
    counts[role] = media.items.filter((item) => item.role === role).length;
  }
  const allFull = roles.length > 0 && roles.every((role) => counts[role]! >= (model.roles[role] ?? 0));

  async function onFiles(files: File[]) {
    if (files.length === 0) return;
    onError(null);
    setProgress({ done: 0, total: files.length });

    const urls: (string | null)[] = files.map(() => null);
    const failures: { name: string; message: string }[] = [];
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const index = next++;
        const file = files[index]!;
        try {
          urls[index] = (await uploadMedia(file)).url;
        } catch (caught) {
          failures.push({
            name: file.name,
            message: caught instanceof Error ? caught.message : "upload failed",
          });
        }
        setProgress((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker),
    );

    /* The files outlive this run: they join the shelf the picker offers, so a
       reference used once can be reached again without a second upload. The
       batch lands in the order it was chosen, first pick on top. */
    const now = Date.now();
    const landed = files.flatMap((file, index) => {
      const url = urls[index];
      return url ? [{ file, url, createdAt: now - index }] : [];
    });
    if (landed.length > 0) {
      setUploads((prev) =>
        [...landed].reverse().reduce(
          (shelf, { file, url, createdAt }) =>
            rememberUpload(shelf, {
              id: crypto.randomUUID(),
              url,
              kind: kindOfFile(file),
              name: file.name,
              createdAt,
            }),
          prev,
        ),
      );
      setStaged({ id: now, urls: landed.map(({ url }) => url) });
    }
    if (failures.length > 0) onError(describeFailures(failures, files.length));
    setProgress(null);
  }

  /* accept is set on the element rather than through state: the picker opens in
     the same tick as the choice, before React could re-render it. */
  function begin(role: MediaRole) {
    const element = inputRef.current;
    if (!element) return;
    roleRef.current = role;
    element.accept = ROLE_ACCEPT[role];
    element.click();
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      hidden
      onChange={(event) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        void onFiles(files);
      }}
    />
  );

  /* A replace, not an append: the panel edits one role's whole set, so what it
     hands back decides both what arrives and what leaves. Rows whose URL
     survives keep their id, and with it their place in the strip. */
  function apply(role: MediaRole, urls: string[]) {
    const keep = new Set(urls);
    const held = new Set<string>();
    for (const item of media.items) {
      if (item.role !== role) continue;
      if (keep.has(item.url)) held.add(item.url);
      else media.remove(item.id);
    }
    for (const url of urls) {
      if (!held.has(url)) media.add({ id: crypto.randomUUID(), url, role });
    }
  }

  return {
    roles,
    items: media.items,
    uploads,
    staged,
    uploading: progress !== null,
    progress,
    allFull,
    input,
    begin,
    apply,
  };
}

/** One file failing names its reason; several name the files, since the
    reasons are usually the same and the names are what the visitor re-picks. */
function describeFailures(failures: { name: string; message: string }[], total: number): string {
  if (failures.length === 1 && total === 1) {
    return `Upload failed — ${failures[0]!.message}. Retry in a moment.`;
  }
  if (failures.length === 1) {
    return `${failures[0]!.name} did not upload — ${failures[0]!.message}. The other files are on the shelf.`;
  }
  const names = failures.map((failure) => failure.name).join(", ");
  return failures.length === total
    ? `Upload failed — ${failures[0]!.message}. Retry in a moment.`
    : `${failures.length} of ${total} files did not upload (${names}). The rest are on the shelf.`;
}

/** Attached inputs, above the prompt — the frames read before the words do. */
export function MediaStrip({ model }: { model: ModelEntry }) {
  const media = useMedia(model);
  const items = media.items.filter((item) => model.roles[item.role]);
  if (items.length === 0) return null;

  return (
    <ul className="ohf-strip">
      {items.map((item) => (
        <li key={item.id} className="ohf-strip-item">
          <span className="ohf-strip-tile">
            {item.role === "audio" || item.role === "video" ? (
              <span className="ohf-strip-glyph">
                {item.role === "audio" ? <AudioIcon size={20} /> : <VideoIcon size={20} />}
              </span>
            ) : (
              /* Blob-hosted user upload; next/image would proxy an arbitrary
                 remote host for a 56px thumb. */
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                className="ohf-strip-thumb"
                src={item.url}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.visibility = "hidden";
                }}
              />
            )}
            <span className="ohf-strip-tag">{ROLE_TAGS[item.role]}</span>
          </span>
          <button
            type="button"
            className="ohf-strip-remove"
            aria-label={`Remove ${ROLE_LABELS[item.role].toLowerCase()}`}
            onClick={() => media.remove(item.id)}
          >
            <CloseIcon size={10} />
          </button>
        </li>
      ))}
    </ul>
  );
}
