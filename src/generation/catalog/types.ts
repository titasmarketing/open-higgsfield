export type Surface = "image" | "video";
export type MediaRole = "start" | "end" | "reference" | "video" | "audio";

export type MediaItem = {
  id: string;
  url: string;
  role: MediaRole;
};

export type SettingField =
  | { type: "enum"; values: readonly string[]; default: string }
  | { type: "range"; min: number; max: number; default: number; step?: number }
  | { type: "boolean"; default: boolean }
  /** Free text the model reads as a brief field (niche, audience, language). */
  | { type: "text"; default: string; maxLength: number; placeholder?: string }
  /** A Marketing Studio preset picked from the live catalog; "" means none. */
  | { type: "preset"; default: "" };

export type PlatformPaths = {
  text?: string;
  image?: string;
  firstLast?: string;
  reference?: string;
};

export type ModelEntry = {
  id: string;
  surface: Surface;
  label: string;
  roles: Partial<Record<MediaRole, number>>;
  settings: Record<string, SettingField>;
  /** Submit paths when the shared mapper is enough. Soul, Kling 3, and Seedance keep custom maps. */
  paths?: PlatformPaths;
  /** The prompt may be left empty (Genjutsu works from its inputs alone). */
  promptOptional?: boolean;
  /** Reason the run cannot be submitted yet, or null when it can. */
  check?: (plane: GenerationPlane) => string | null;
};

export type GenerationPlane = {
  model: string;
  prompt: { text: string };
  media: Partial<Record<MediaRole, MediaItem[]>>;
  settings: Record<string, unknown>;
};
