# Real-app e2e example

A standalone [SvelteKit](https://svelte.dev/docs/kit) app that consumes the
**deployed** `@globalize-now/paraglidejs-po-format` plugin the way a real user does —
via its jsdelivr CDN URL in [`project.inlang/settings.json`](./project.inlang/settings.json) —
and verifies the result in a real browser with [Playwright](https://playwright.dev).

It proves the full pipeline:

> published npm artifact → jsdelivr → Paraglide module loader → PO import → compile → SvelteKit render → browser

## What it asserts

Translations live in [`messages/`](./messages) (`en`, `de`, `pl`). The e2e
([`e2e/app.e2e.ts`](./e2e/app.e2e.ts)) pins the plugin's two non-trivial behaviors:

- **`{name}` placeholder interpolation** — `Hello World` / `Hallo World` / `Cześć World`.
- **gettext-plural → CLDR-category selection** — counts 1 / 2 / 5 render the right
  forms per locale. Polish is included specifically because it puts 1 / 2 / 5 into
  three *distinct* CLDR categories (`one` / `few` / `many`), so the assertion has
  teeth (en and de share English's 2-form rule).

It also covers url-pattern routing (`/`, `/de`, `/pl`) and locale switching.

## Run it

```bash
npm install
npm test            # playwright install && vite build (compiles via the CDN plugin) && preview && e2e
```

The first build needs network access to fetch the plugin from jsdelivr. inlang caches
the resolved module under `project.inlang/cache/` (gitignored); **delete that
directory if a run looks stale** after a plugin republish.

> Requires plugin **>= 0.1.1**. `0.1.0` cannot be loaded via a CDN URL (its bundle's
> `createRequire(import.meta.url)` banner throws when inlang evaluates the module as a
> `data:` URL). The CDN URL here is pinned to `@0.1.1`.

## Running against a local plugin build (pre-publish)

To validate an unpublished change to the plugin, serve the freshly built bundle over
HTTP (this exercises inlang's real fetch → `data:`-URL load path, unlike a `file://`
path) and point `modules` at it:

```bash
# from the repo root: build the plugin, then serve dist over http
npm run build
node -e "require('http').createServer((_,r)=>r.end(require('fs').readFileSync('dist/index.js'))).listen(8787)"
```

Set `"modules": ["http://localhost:8787/index.js"]` in
`project.inlang/settings.json`, `rm -rf project.inlang/cache src/lib/paraglide`, then
`npm test`.
