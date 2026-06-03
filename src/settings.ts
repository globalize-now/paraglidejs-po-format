import { Type, type Static } from "@sinclair/typebox";

const pathPatternString = Type.String({
  // `languageTag` is accepted for legacy parity with other inlang plugins.
  pattern: ".*\\{(languageTag|locale)\\}.*\\.po$",
  examples: ["./messages/{locale}.po", "./locales/{locale}/messages.po"],
  title: "Path to PO files",
  description: "Path to the PO files. Must include `{locale}` and end with `.po`.",
});

const pathPatternArray = Type.Array(pathPatternString, {
  title: "Paths to PO files",
  description: "Multiple paths to PO files. Each must include `{locale}` and end with `.po`.",
});

const messageFormat = Type.Optional(
  Type.Union([Type.Literal("plain"), Type.Literal("icu")], {
    default: "plain",
    title: "Message format of msgstr values",
    description:
      "How to parse translation strings. `plain` (default) reads `{name}` placeholders only and is safe for arbitrary gettext text. `icu` parses each singular `msgstr` as ICU MessageFormat (inline plural/select/selectordinal and number/date/time formatting); enable it only when your PO strings are authored as ICU, since incidental braces or apostrophes can otherwise be misread.",
  }),
);

export type PluginSettings = Static<typeof PluginSettings>;
export const PluginSettings = Type.Object({
  pathPattern: Type.Union([pathPatternString, pathPatternArray]),
  messageFormat,
});
