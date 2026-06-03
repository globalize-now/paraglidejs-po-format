import esbuild from "esbuild";

/**
 * inlang loads a plugin from a single module, so the plugin and all of its
 * runtime dependencies (e.g. gettext-parser) are bundled into one ESM file.
 * `@inlang/sdk` is types-only here and is not bundled.
 *
 * Target is Node: Paraglide compiles translations at build time in Node, and
 * gettext-parser depends on Node built-ins (node:buffer/stream, iconv-lite).
 * This plugin is therefore not intended for pure-browser plugin hosts.
 *
 * `target` is the lowest currently-supported Node LTS (see `engines` in
 * package.json) so the emitted bundle runs on every supported runtime.
 */
const options = {
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  minify: process.env.NODE_ENV === "production",
  sourcemap: true,
  // gettext-parser's transitive CJS deps (iconv-lite/safer-buffer) do a dynamic
  // `require("buffer")`. In an ESM bundle `require` is undefined, so provide one.
  //
  // inlang loads a remote plugin by fetching the module and evaluating it as a
  // `data:` URL, so `import.meta.url` is then a `data:` URL — which `createRequire`
  // rejects (ERR_INVALID_ARG_VALUE). Fall back to a real `file:` URL base in that
  // case. Only built-in requires (`buffer`, `stream`) run at runtime — everything
  // else is bundled — so the base path is irrelevant to resolution.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'module';",
      "import { pathToFileURL as __pathToFileURL } from 'url';",
      "const require = __createRequire(import.meta.url.startsWith('file:') ? import.meta.url : __pathToFileURL(process.cwd() + '/').href);",
    ].join("\n"),
  },
};

const watch = process.argv.includes("--watch");

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("watching…");
} else {
  await esbuild.build(options);
}
