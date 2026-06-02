import { describe, expect, it } from "vitest";
import { newProject, loadProjectInMemory, selectBundleNested, type ProjectSettings } from "@inlang/sdk";
import plugin, { PLUGIN_KEY } from "./index.js";

const enc = (s: string) => new TextEncoder().encode(s);

const settings = {
  baseLocale: "en",
  locales: ["en", "de"],
  [PLUGIN_KEY]: { pathPattern: "./{locale}.po" },
} as unknown as ProjectSettings;

async function loadProject() {
  const blob = await newProject({ settings });
  return loadProjectInMemory({ blob, providePlugins: [plugin] });
}

describe("integration with @inlang/sdk", () => {
  it("registers the plugin without project errors", async () => {
    const project = await loadProject();
    const errors = await project.errors.get();
    expect(errors).toEqual([]);
    const plugins = await project.plugins.get();
    expect(plugins.map((p) => p.key)).toContain(PLUGIN_KEY);
    await project.close();
  });

  it("imports singular PO entries that the SDK stores and can query nested", async () => {
    const project = await loadProject();
    const en = ['msgid "greeting"', 'msgstr "Hello {name}"'].join("\n");
    const de = ['msgid "greeting"', 'msgstr "Hallo {name}"'].join("\n");

    await project.importFiles({
      pluginKey: PLUGIN_KEY,
      files: [
        { locale: "en", content: enc(en) },
        { locale: "de", content: enc(de) },
      ],
    });

    const bundles = await selectBundleNested(project.db).execute();
    expect(bundles).toHaveLength(1);

    const bundle = bundles[0]!;
    expect(bundle.id).toBe("greeting");
    expect(bundle.messages.map((m) => m.locale).sort()).toEqual(["de", "en"]);

    const en_ = bundle.messages.find((m) => m.locale === "en")!;
    expect(en_.variants[0]!.pattern).toEqual([
      { type: "text", value: "Hello " },
      { type: "expression", arg: { type: "variable-reference", name: "name" } },
    ]);
    await project.close();
  });

  it("imports plural PO entries with a count selector and CLDR-matched variants", async () => {
    const project = await loadProject();
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

    await project.importFiles({ pluginKey: PLUGIN_KEY, files: [{ locale: "en", content: enc(po) }] });

    const bundle = await selectBundleNested(project.db).where("bundle.id", "=", "{count} apple").executeTakeFirst();
    expect(bundle).toBeDefined();

    const message = bundle!.messages[0]!;
    expect(message.selectors).toEqual([{ type: "variable-reference", name: "countPlural" }]);
    expect(message.variants).toHaveLength(2);

    const matches = message.variants.map((v) => v.matches);
    expect(matches).toContainEqual([{ type: "literal-match", key: "countPlural", value: "one" }]);
    expect(matches).toContainEqual([{ type: "catchall-match", key: "countPlural" }]);

    const declarationTypes = bundle!.declarations.map((d) => `${d.type}:${d.name}`);
    expect(declarationTypes).toContain("input-variable:count");
    expect(declarationTypes).toContain("local-variable:countPlural");
    await project.close();
  });
});
