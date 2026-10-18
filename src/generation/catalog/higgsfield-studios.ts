import type { ModelEntry } from "./types";

/* Higgsfield's own studios: Ads Studio and Marketing Studio make campaign
   images, Genjutsu restyles a clip while keeping its motion. Each maps to one
   endpoint in to-platform.ts. */

const ADS_ASPECT = [
  "1:1",
  "4:5",
  "5:4",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "21:9",
  "3:2",
  "2:3",
  "2:1",
  "1:2",
] as const;

export const adsStudio: ModelEntry = {
  id: "ads-studio",
  surface: "image",
  label: "Ads Studio",
  roles: { reference: 10 },
  settings: {
    aspectRatio: { type: "enum", values: ADS_ASPECT, default: "4:5" },
    batchSize: { type: "range", min: 1, max: 8, default: 1 },
    niche: {
      type: "text",
      default: "",
      maxLength: 1000,
      placeholder: "Ex.: clínica de estética, academia, e-commerce de moda",
    },
    targetAudience: {
      type: "text",
      default: "",
      maxLength: 2000,
      placeholder: "Ex.: mulheres de 25 a 45 anos interessadas em skincare",
    },
    language: {
      type: "text",
      default: "Portuguese (Brazil)",
      maxLength: 80,
      placeholder: "Ex.: Portuguese (Brazil)",
    },
  },
};

export const marketingStudioImage: ModelEntry = {
  id: "marketing-studio-image",
  surface: "image",
  label: "Marketing Studio Image",
  roles: { reference: 16 },
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"],
      default: "auto",
    },
    resolution: { type: "enum", values: ["1k", "2k", "4k"], default: "2k" },
    quality: { type: "enum", values: ["low", "medium", "high"], default: "high" },
    preset: { type: "preset", default: "" },
  },
  check: (plane) => {
    if (!plane.settings.preset) return null;
    const refs = plane.media.reference?.length ?? 0;
    if (refs === 0) {
      return "Com um preset, anexe a foto do produto (e, se quiser, uma segunda foto de modelo).";
    }
    if (refs > 2) {
      return "Com um preset, use no máximo 2 imagens: o produto e, opcionalmente, um modelo.";
    }
    return null;
  },
};

export const genjutsu: ModelEntry = {
  id: "genjutsu",
  surface: "video",
  label: "Genjutsu",
  roles: { video: 1, reference: 8 },
  settings: {
    resolution: { type: "enum", values: ["480p", "720p", "1080p"], default: "720p" },
  },
  promptOptional: true,
  check: (plane) => {
    if (!plane.media.video?.length) {
      return "O Genjutsu precisa de um vídeo de origem (mínimo de 4s, usa até 30s).";
    }
    if (!plane.media.reference?.length) {
      return "O Genjutsu precisa de pelo menos 1 imagem de referência (personagem, cenário ou estilo).";
    }
    return null;
  },
};
