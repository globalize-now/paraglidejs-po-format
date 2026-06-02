import { describe, expect, it } from "vitest";
import { importFiles } from "./importFiles.js";
import { PLUGIN_KEY } from "../plugin.js";
import type { ProjectSettings } from "@inlang/sdk";

const settings = {
  baseLocale: "en",
  locales: ["en", "de"],
  [PLUGIN_KEY]: { pathPattern: "./{locale}.po" },
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

  it("skips the PO header entry", async () => {
    const po = ['msgid ""', 'msgstr ""', '"Project-Id-Version: x\\n"'].join("\n");
    const { bundles } = await importFiles({ files: [file("en", po)], settings });
    expect(bundles).toEqual([]);
  });
});
