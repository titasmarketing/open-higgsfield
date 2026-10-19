import { unwrap } from "./action-result";
import * as actions from "./actions";
import type { GenerationPlane } from "./catalog/types";

/* The browser's side of the server actions: same names and the same throw on
   failure, but the error now carries the server's own message. */

export { clearPlatformCredentials, hasPlatformCredentials } from "./actions";

export async function savePlatformCredentials(data: unknown) {
  return unwrap(await actions.savePlatformCredentials(data));
}

export async function submitGeneration(plane: GenerationPlane) {
  return unwrap(await actions.submitGeneration(plane));
}

export async function listMarketingPresets() {
  return unwrap(await actions.listMarketingPresets());
}

export async function getGenerationStatuses(data: unknown) {
  return unwrap(await actions.getGenerationStatuses(data));
}
