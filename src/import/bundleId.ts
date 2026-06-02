/** Delimiter joining a gettext `msgctxt` to its `msgid` when forming a bundle id. */
export const CONTEXT_DELIMITER = "::";

/**
 * Derives a stable inlang bundle id from a PO entry's `msgctxt` and `msgid`.
 *
 * gettext disambiguates otherwise-identical `msgid`s with `msgctxt`. The inlang
 * data model has no context field, so we fold the context into the bundle id as
 * `"<msgctxt>::<msgid>"`. Without a context the id is the bare `msgid`. (This
 * plugin is import-only, so the id only needs to be stable and collision-free,
 * not reversible.)
 */
export function bundleId(msgctxt: string | undefined, msgid: string): string {
  if (msgctxt === undefined || msgctxt === "") {
    return msgid;
  }
  return `${msgctxt}${CONTEXT_DELIMITER}${msgid}`;
}
