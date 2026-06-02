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

export type PluginSettings = Static<typeof PluginSettings>;
export const PluginSettings = Type.Object({
  pathPattern: Type.Union([pathPatternString, pathPatternArray]),
});
