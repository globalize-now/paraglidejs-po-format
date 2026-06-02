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
  },
}
```

`pathPattern` also accepts an array of patterns. The legacy `{languageTag}` token is
accepted as an alias for `{locale}`.

## How PO maps to the inlang data model

| PO                           | inlang                                                 |
| ---------------------------- | ------------------------------------------------------ |
| each entry (`msgid`)         | a **Bundle** (one per key)                             |
| each `.po` file              | the **Messages**/**Variants** for that locale          |
| `msgstr`                     | a single **Variant** (`matches: []`)                   |
| `msgid_plural` + `msgstr[N]` | a `count` selector + one **Variant** per CLDR category |
| `msgctxt`                    | folded into the bundle id as `"<msgctxt>::<msgid>"`    |
| `{name}` placeholder         | an `expression` node referencing variable `name`       |

### Placeholders

Placeholders use brace syntax: `"Hello {name}"`. `{name}` becomes a variable
reference; any non-identifier braces (`{`, `{1,2}`, …) are treated as literal text.
Use `\{` / `\}` to escape literal braces. Positional gettext placeholders
(`%s`, `%d`) are **not** interpreted as variables.

### Plurals

Plural entries are mapped to CLDR categories (`one`, `few`, `many`, `other`, …)
derived per-locale from the file's `Plural-Forms` header. A `count` input variable
and a `countPlural = count : plural` selector are synthesized; each `msgstr[N]`
becomes a variant matched on its CLDR category, with one catch-all fallback variant.

Write the plural number as `{count}` in your PO strings (e.g. `"{count} files"`) so
the displayed number and the plural selection share the same variable.

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

## Development

```bash
npm test        # vitest (unit + @inlang/sdk integration)
npm run build   # bundle to a single ESM dist/index.js + d.ts
npm run lint    # eslint
```

## License

MIT
