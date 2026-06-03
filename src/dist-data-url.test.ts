import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Regression guard for the deployed-bundle load path.
 *
 * inlang loads a remote plugin by fetching the module and evaluating it as a
 * `data:` URL — at which point `import.meta.url` is a `data:` URL. The bundle's
 * `createRequire` banner (see build.js) must tolerate that; a naive
 * `createRequire(import.meta.url)` throws ERR_INVALID_ARG_VALUE and the plugin
 * silently fails to load (shipped broken in 0.1.0).
 *
 * Runs only when `dist/` has been built (e.g. after `npm run build`).
 */
const distPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

describe("deployed bundle loads the way inlang loads remote modules", () => {
  it.runIf(existsSync(distPath))("imports via a data: URL without throwing", async () => {
    const code = readFileSync(distPath).toString("base64");
    const mod = await import("data:text/javascript;base64," + code);
    expect(mod.PLUGIN_KEY).toBe("plugin.globalizeNow.po");
    expect(mod.default?.key).toBe("plugin.globalizeNow.po");
  });
});
