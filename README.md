# @globalize-now/paraglidejs-po-format

An [inlang](https://inlang.com) / [Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs)
plugin that lets you use **gettext PO files as translation inputs**. Keep your `.po`
files as the source of truth and let Paraglide compile from them.

This plugin is **import-only**: it reads PO files into the inlang data model. It does
not write PO files back (no `exportFiles`).

## Install

```bash
npm install --save-dev @globalize-now/paraglidejs-po-format
```

## Configure

Add the plugin and a `pathPattern` to your `project.inlang/settings.json`. The
`pathPattern` must contain `{locale}` and end in `.po`:

```jsonc
{
  "baseLocale": "en",
  "locales": ["en", "de", "fr"],
  "modules": [
    "https://cdn.jsdelivr.net/npm/@globalize-now/paraglidejs-po-format/dist/index.js",
    // …alongside any other inlang modules you use.
  ],
  "plugin.globalizeNow.po": {
    "pathPattern": "./messages/{locale}.po",
    // "messageFormat": "icu", // opt in to ICU MessageFormat (default: "plain")
  },
}
```

`pathPattern` also accepts an array of patterns. The legacy `{languageTag}` token is
accepted as an alias for `{locale}`.

### `messageFormat`

How `msgstr` strings are parsed — `"plain"` (default) or `"icu"`:

- **`plain`** reads `{name}` placeholders only and leaves everything else
  (apostrophes, stray braces, `%s`/`%d`) as literal text. Safe for arbitrary gettext
  content.
- **`icu`** parses each singular `msgstr` as ICU MessageFormat (inline
  `plural` / `select` / `selectordinal` and `number` / `date` / `time` formatting).

ICU is **opt-in** because parsing arbitrary gettext text as ICU can silently
misread it: any unparseable brace (e.g. `"see {1+1}"`) drops **all** variables in
that string, and an apostrophe directly before a placeholder (e.g. French
`"l'{article}"`) silently swallows it. Enable `icu` only when your PO strings are
actually authored as ICU.

## How PO maps to the inlang data model

| PO                               | inlang                                                 |
| -------------------------------- | ------------------------------------------------------ |
| each entry (`msgid`)             | a **Bundle** (one per key)                             |
| each `.po` file                  | the **Messages**/**Variants** for that locale          |
| `msgstr`                         | a single **Variant** (`matches: []`)                   |
| `msgstr` with inline ICU (`icu`) | `selectors` + one **Variant** per branch               |
| `msgid_plural` + `msgstr[N]`     | a `count` selector + one **Variant** per CLDR category |
| `msgctxt`                        | folded into the bundle id as `"<msgctxt>::<msgid>"`    |
| `{name}` placeholder             | an `expression` node referencing variable `name`       |

### Placeholders (`plain`, default)

Placeholders use brace syntax: `"Hello {name}"`. `{name}` becomes a variable
reference as long as `name` is a valid identifier; any other braces (`{`, `{1,2}`, …)
are kept as literal text. Use `\{` / `\}` to escape literal braces and `\\` for a
literal backslash. Positional gettext placeholders (`%s`, `%d`) are **not**
interpreted as variables.

### ICU MessageFormat (`"messageFormat": "icu"`)

When enabled, each singular `msgstr` is parsed as
[ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/):

```po
msgid "inbox"
msgstr "{count, plural, one {# message} other {# messages}}"

msgid "invite"
msgstr "{host} invites {gender, select, male {him} female {her} other {them}}"

msgid "rank"
msgstr "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} place"

msgid "total"
msgstr "Total: {amount, number, ::currency/USD}"
```

- `plural` / `selectordinal` synthesize a `count`-style input variable plus a
  `… : plural` selector (`selectordinal` adds `type=ordinal`); each category becomes
  a variant matched on its CLDR category, with `other` as the catch-all.
- `select` matches the input variable directly (e.g. `gender=male`, `*` catch-all).
- Nested constructs are flattened into a cross-product of variants with one selector
  per selecting argument.
- `number` / `date` / `time` become local-variable formatters (`number` →
  `Intl.NumberFormat`, `date`/`time` → `Intl.DateTimeFormat`).
- `#` renders the enclosing plural's number.

In `icu` mode **escaping** follows ICU, **not** backslashes: wrap literal braces in
apostrophes (`'{'` → `{`, `'}'` → `}`) and write a literal apostrophe as `''`. A
`msgstr` that is not valid ICU (e.g. an unbalanced `{`) is imported verbatim as
literal text rather than failing the build.

### Plurals

Plurals work in either mode via the gettext-native form (`msgid_plural` with
`msgstr[0..N]`). Indices are mapped to CLDR categories (`one`, `few`, `many`,
`other`, …) derived per-locale from the file's `Plural-Forms` header. A `count`
input variable and a `countPlural = count : plural` selector are synthesized; each
`msgstr[N]` becomes a variant matched on its CLDR category, with one catch-all
fallback. Write the number as `{count}` in the strings (e.g. `"{count} files"`) so
the displayed number and the plural selection share the same variable.

In `icu` mode you can alternatively write a plural inline in a single `msgstr`
(`{count, plural, …}`). Detection is per entry: if `msgid_plural` is present the
gettext-native path is used; otherwise the `msgstr` is parsed according to
`messageFormat`.

### Untranslated entries

Entries with an empty `msgstr` (a partial PO or a `.pot` template) are skipped, so
the message falls back to the base locale at runtime instead of rendering an empty
string. A plural entry is treated the same way if **any** of its forms is
untranslated: the whole entry is skipped (rather than rendering an empty string for
one CLDR category), so it falls back to the base locale until every form is filled.

## Scope & limitations

- **Import-only.** PO files are the source of truth; the plugin does not regenerate
  them. Round-tripping back to PO is out of scope.
- **Node / build-time only.** Paraglide compiles at build time in Node, and the
  bundled `gettext-parser` relies on Node built-ins. This plugin is not intended for
  pure-browser plugin hosts.
- **Lossy on import.** PO comments, source references (`#:`), and flags (`#, fuzzy`)
  have no place in the inlang model and are dropped.
- Positional `%s` / `%d` placeholders are kept as literal text, not variables.
- **ICU caveats** (`messageFormat: "icu"` only). Exact plural matches (`=0`, `=1`) are
  not representable — Paraglide matches CLDR keywords only — so they are dropped in
  favour of the keyword branches (`one`, `other`, …); a string whose _only_ plural
  cases are `=N` (no keyword branch) is kept verbatim as literal text rather than
  emitting an empty selector. Plural `offset` is parsed but `#` still renders the raw
  number. ICU tags/markup (`<b>…</b>`) are treated as literal text. A top-level
  `plural`/`select` inside a single gettext `msgstr[N]` form is not supported (that form
  is kept as literal text); use one style or the other per entry. Predefined `date`/`time`
  styles (`short`, `medium`, …) map to `Intl` `dateStyle`/`timeStyle`; this mapping has
  not yet been verified against the Paraglide runtime (`number` formatting has).

## Development

```bash
npm test        # vitest (unit + @inlang/sdk integration)
npm run build   # bundle to a single ESM dist/index.js + d.ts
npm run lint    # eslint
```

### Example app (real-app e2e)

[`example/`](./example) is a standalone SvelteKit + Playwright app that consumes the
**published** plugin via its jsdelivr CDN URL (exactly as documented above) and
asserts the compiled output in a real browser — placeholder interpolation and
gettext→CLDR plural selection across `en`/`de`/`pl`. See [`example/README.md`](./example/README.md).

## License

MIT
