import { t2v, videoModel } from "./defaults";
import type { ModelEntry } from "./types";

export const wan3Prime = videoModel(
  "wan-3-prime",
  "Wan 3.0 Prime",
  { start: 1 },
  t2v("alibaba/wan-3.0-prime/text-to-video"),
);

/* Reference-to-video: up to 10 images, 5 clips and 5 audio tracks guide one
   shot of 2–30s. Billed per second of output plus the input clips' length. */
export const wan3PrimeReference: ModelEntry = {
  id: "wan-3-prime-reference",
  surface: "video",
  label: "Wan 3.0 Prime Reference",
  roles: { reference: 10, video: 5, audio: 5 },
  settings: {
    aspectRatio: {
      type: "enum",
      values: ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"],
      default: "adaptive",
    },
    duration: { type: "range", min: 2, max: 30, default: 5 },
    resolution: { type: "enum", values: ["480p", "720p", "1080p"], default: "720p" },
    generateAudio: { type: "boolean", default: true },
    promptExtend: { type: "boolean", default: false },
    enableThinking: { type: "boolean", default: false },
  },
};
