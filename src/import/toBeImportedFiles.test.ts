import { describe, expect, it } from "vitest";
import { toBeImportedFiles } from "./toBeImportedFiles.js";
import { PLUGIN_KEY } from "../plugin.js";
import type { ProjectSettings } from "@inlang/sdk";

function settingsWith(pathPattern: string | string[]): ProjectSettings {
  return {
    baseLocale: "en",
    locales: ["en", "de"],
    [PLUGIN_KEY]: { pathPattern },
  } as unknown as ProjectSettings;
}

describe("toBeImportedFiles", () => {
  it("expands {locale} once per locale", async () => {
    const result = await toBeImportedFiles({ settings: settingsWith("./messages/{locale}.po") });
    expect(result).toEqual([
      { locale: "en", path: "./messages/en.po" },
      { locale: "de", path: "./messages/de.po" },
    ]);
  });

  it("expands the legacy {languageTag} token", async () => {
    const result = await toBeImportedFiles({ settings: settingsWith("./{languageTag}.po") });
    expect(result.map((r) => r.path)).toEqual(["./en.po", "./de.po"]);
  });

  it("supports an array of path patterns", async () => {
    const result = await toBeImportedFiles({
      settings: settingsWith(["./a/{locale}.po", "./b/{locale}.po"]),
    });
    expect(result.map((r) => r.path)).toEqual(["./a/en.po", "./a/de.po", "./b/en.po", "./b/de.po"]);
  });

  it("returns nothing when no pathPattern is configured", async () => {
    const result = await toBeImportedFiles({
      settings: { baseLocale: "en", locales: ["en"] } as unknown as ProjectSettings,
    });
    expect(result).toEqual([]);
  });
});
