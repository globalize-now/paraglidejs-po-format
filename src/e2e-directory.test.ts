import { afterEach, describe, expect, it } from "vitest";
import { loadProjectFromDirectory, selectBundleNested, type ProjectSettings } from "@inlang/sdk";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import plugin, { PLUGIN_KEY } from "./index.js";

/**
 * End-to-end through the disk-discovery seam: real `.po` files on disk →
 * the SDK uses `toBeImportedFiles` to locate them → `importFiles` stores them.
 * This is the part the in-memory test (which feeds files in directly) skips.
 */

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject(poByLocale: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "po-e2e-"));
  tmpDirs.push(root);
  const projectDir = path.join(root, "project.inlang");
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(root, "messages"), { recursive: true });
  for (const [locale, content] of Object.entries(poByLocale)) {
    fs.writeFileSync(path.join(root, "messages", `${locale}.po`), content);
  }
  const settings: ProjectSettings = {
    baseLocale: "en",
    locales: Object.keys(poByLocale),
    modules: [],
    [PLUGIN_KEY]: { pathPattern: "./messages/{locale}.po" },
  } as unknown as ProjectSettings;
  fs.writeFileSync(path.join(projectDir, "settings.json"), JSON.stringify(settings, null, 2));
  return projectDir;
}

describe("end-to-end from a project directory", () => {
  it("discovers and imports PO files from disk", async () => {
    const projectDir = makeProject({
      en: 'msgid "greeting"\nmsgstr "Hello {name}"\n',
      de: 'msgid "greeting"\nmsgstr "Hallo {name}"\n',
    });

    const project = await loadProjectFromDirectory({ path: projectDir, fs, providePlugins: [plugin] });
    expect(await project.errors.get()).toEqual([]);

    const bundles = await selectBundleNested(project.db).execute();
    expect(bundles.map((b) => b.id)).toEqual(["greeting"]);

    const byLocale = Object.fromEntries(bundles[0]!.messages.map((m) => [m.locale, m.variants[0]!.pattern]));
    expect(byLocale.en).toEqual([
      { type: "text", value: "Hello " },
      { type: "expression", arg: { type: "variable-reference", name: "name" } },
    ]);
    expect(byLocale.de?.[0]).toEqual({ type: "text", value: "Hallo " });

    await project.close();
  });
});
