import type { InlangPlugin } from "@inlang/sdk";
import { PluginSettings } from "./settings.js";
import { toBeImportedFiles } from "./import/toBeImportedFiles.js";
import { importFiles } from "./import/importFiles.js";

export const PLUGIN_KEY = "plugin.globalizeNow.po";

export const plugin: InlangPlugin<{
  [PLUGIN_KEY]?: PluginSettings;
}> = {
  key: PLUGIN_KEY,
  settingsSchema: PluginSettings,
  toBeImportedFiles,
  importFiles,
  // Import-only: no exportFiles. PO files are the source of truth.
};
