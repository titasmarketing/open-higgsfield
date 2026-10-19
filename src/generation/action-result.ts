import { MissingCredentialsError } from "./credentials";

/** What a server action hands back: its value, or the reason it failed. A
    thrown error would reach the browser with its message stripped. */
export type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; code?: "missing-key" };

/** Turns a failed result back into the error the caller would have caught. */
export function unwrap<T>(result: ActionResult<T>): T {
  if (result.ok) return result.value;
  if (result.code === "missing-key") throw new MissingCredentialsError();
  throw new Error(result.error);
}
