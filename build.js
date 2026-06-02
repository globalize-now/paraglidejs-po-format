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
  banner: {
    js: "import { createRequire as __createRequire } from 'module';\nconst require = __createRequire(import.meta.url);",
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
