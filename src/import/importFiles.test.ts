import { describe, expect, it } from "vitest";
import { importFiles } from "./importFiles.js";
import { PLUGIN_KEY } from "../plugin.js";
import type { ProjectSettings } from "@inlang/sdk";

const settings = {
  baseLocale: "en",
  locales: ["en", "de"],
  [PLUGIN_KEY]: { pathPattern: "./{locale}.po" },
} as unknown as ProjectSettings;

const icuSettings = {
  baseLocale: "en",
  locales: ["en", "de"],
  [PLUGIN_KEY]: { pathPattern: "./{locale}.po", messageFormat: "icu" },
} as unknown as ProjectSettings;

function file(locale: string, po: string) {
  return { locale, content: new TextEncoder().encode(po) };
}

describe("importFiles", () => {
  it("imports a plain singular entry", async () => {
    const po = ['msgid "greeting"', 'msgstr "Hello world"'].join("\n");
    const { bundles, messages, variants } = await importFiles({ files: [file("en", po)], settings });

    expect(bundles).toEqual([{ id: "greeting", declarations: [] }]);
    expect(messages).toEqual([{ bundleId: "greeting", locale: "en", selectors: [] }]);
    expect(variants).toEqual([
      {
        messageBundleId: "greeting",
        messageLocale: "en",
        matches: [],
        pattern: [{ type: "text", value: "Hello world" }],
      },
    ]);
  });

  it("maps {name} placeholders to expression nodes and input-variable declarations", async () => {
    const po = ['msgid "welcome"', 'msgstr "Hi {name}"'].join("\n");
    const { bundles, variants } = await importFiles({ files: [file("en", po)], settings });

    expect(bundles[0]!.declarations).toEqual([{ type: "input-variable", name: "name" }]);
    expect(variants[0]!.pattern).toEqual([
      { type: "text", value: "Hi " },
      { type: "expression", arg: { type: "variable-reference", name: "name" } },
    ]);
  });

  it("folds msgctxt into the bundle id", async () => {
    const po = ['msgctxt "menu"', 'msgid "Open"', 'msgstr "Open"'].join("\n");
    const { bundles } = await importFiles({ files: [file("en", po)], settings });
    expect(bundles[0]!.id).toBe("menu::Open");
  });

  it("imports a plural entry with a count selector and CLDR-matched variants", async () => {
    const po = [
      'msgid ""',
      'msgstr ""',
      '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
      "",
      'msgid "{count} apple"',
      'msgid_plural "{count} apples"',
      'msgstr[0] "{count} apple"',
      'msgstr[1] "{count} apples"',
    ].join("\n");

    const { bundles, messages, variants } = await importFiles({ files: [file("en", po)], settings });

    expect(bundles[0]!.declarations).toEqual([
      { type: "input-variable", name: "count" },
      {
        type: "local-variable",
        name: "countPlural",
        value: {
          type: "expression",
          arg: { type: "variable-reference", name: "count" },
          annotation: { type: "function-reference", name: "plural", options: [] },
        },
      },
    ]);

    expect(messages[0]!.selectors).toEqual([{ type: "variable-reference", name: "countPlural" }]);

    expect(variants.map((v) => v.matches)).toEqual([
      [{ type: "literal-match", key: "countPlural", value: "one" }],
      [{ type: "catchall-match", key: "countPlural" }],
    ]);
    expect(variants[1]!.pattern).toEqual([
      { type: "expression", arg: { type: "variable-reference", name: "count" } },
      { type: "text", value: " apples" },
    ]);
  });

  it("treats msgstr as plain placeholders by default (ICU not interpreted)", async () => {
    const po = ['msgid "apples"', 'msgstr "{count, plural, one {# apple} other {# apples}}"'].join("\n");
    const { messages, variants } = await importFiles({ files: [file("en", po)], settings });

    // Default `plain` mode: no ICU selectors, the string is kept literal-ish.
    expect(messages[0]!.selectors).toEqual([]);
    expect(variants[0]!.matches).toEqual([]);
    expect(variants).toHaveLength(1);
  });

  it("keeps an elision apostrophe before a placeholder in plain mode", async () => {
    const po = ['msgid "the"', 'msgstr "l\'{article}"'].join("\n");
    const { variants } = await importFiles({ files: [file("fr", po)], settings });

    expect(variants[0]!.pattern).toEqual([
      { type: "text", value: "l'" },
      { type: "expression", arg: { type: "variable-reference", name: "article" } },
    ]);
  });

  it("parses a singular msgstr written as inline ICU plural (messageFormat: icu)", async () => {
    const po = ['msgid "apples"', 'msgstr "{count, plural, one {# apple} other {# apples}}"'].join("\n");
    const { bundles, messages, variants } = await importFiles({ files: [file("en", po)], settings: icuSettings });

    expect(messages[0]!.selectors).toEqual([{ type: "variable-reference", name: "countPlural" }]);
    expect(bundles[0]!.declarations.map((d) => `${d.type}:${d.name}`)).toEqual([
      "input-variable:count",
      "local-variable:countPlural",
    ]);
    expect(variants.map((v) => v.matches)).toEqual([
      [{ type: "literal-match", key: "countPlural", value: "one" }],
      [{ type: "catchall-match", key: "countPlural" }],
    ]);
  });

  it("parses a singular msgstr written as inline ICU select (messageFormat: icu)", async () => {
    const po = ['msgid "stream"', 'msgstr "{g, select, male {his} female {her} other {their}} stream"'].join("\n");
    const { bundles, messages, variants } = await importFiles({ files: [file("en", po)], settings: icuSettings });

    expect(messages[0]!.selectors).toEqual([{ type: "variable-reference", name: "g" }]);
    expect(bundles[0]!.declarations).toEqual([{ type: "input-variable", name: "g" }]);
    expect(variants.map((v) => v.matches)).toEqual([
      [{ type: "literal-match", key: "g", value: "male" }],
      [{ type: "literal-match", key: "g", value: "female" }],
      [{ type: "catchall-match", key: "g" }],
    ]);
  });

  it("merges the same key across locale files into one bundle with two messages", async () => {
    const en = ['msgid "greeting"', 'msgstr "Hello"'].join("\n");
    const de = ['msgid "greeting"', 'msgstr "Hallo"'].join("\n");
    const { bundles, messages } = await importFiles({
      files: [file("en", en), file("de", de)],
      settings,
    });

    expect(bundles).toHaveLength(1);
    expect(messages.map((m) => m.locale).sort()).toEqual(["de", "en"]);
  });

  it("skips untranslated singular entries (empty msgstr)", async () => {
    const po = ['msgid "greeting"', 'msgstr ""'].join("\n");
    const { bundles, messages, variants } = await importFiles({ files: [file("de", po)], settings });
    expect(bundles).toEqual([]);
    expect(messages).toEqual([]);
    expect(variants).toEqual([]);
  });

  it("imports only the translated entries from a partial locale file", async () => {
    const po = [
      'msgid "done"',
      'msgstr "Fertig"',
      "",
      'msgid "pending"',
      'msgstr ""', // untranslated
    ].join("\n");
    const { bundles } = await importFiles({ files: [file("de", po)], settings });
    expect(bundles.map((b) => b.id)).toEqual(["done"]);
  });

  it("skips a partially translated plural so it falls back to the base locale", async () => {
    // msgstr[0] translated, msgstr[1] (the "other"/catch-all form) left empty.
    // Importing it would give the catch-all variant an empty pattern.
    const po = [
      'msgid ""',
      'msgstr ""',
      '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
      "",
      'msgid "{count} apple"',
      'msgid_plural "{count} apples"',
      'msgstr[0] "{count} Apfel"',
      'msgstr[1] ""',
    ].join("\n");
    const { bundles, messages, variants } = await importFiles({ files: [file("de", po)], settings });
    expect(bundles).toEqual([]);
    expect(messages).toEqual([]);
    expect(variants).toEqual([]);
  });

  it("skips the PO header entry", async () => {
    const po = ['msgid ""', 'msgstr ""', '"Project-Id-Version: x\\n"'].join("\n");
    const { bundles } = await importFiles({ files: [file("en", po)], settings });
    expect(bundles).toEqual([]);
  });
});
