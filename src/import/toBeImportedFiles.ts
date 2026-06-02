import { PLUGIN_KEY, type plugin } from "../plugin.js";

/**
 * Expands the configured `pathPattern`(s) into one file descriptor per locale by
 * substituting `{locale}` (or the legacy `{languageTag}`) with each locale from
 * the project settings. The SDK then reads those paths off disk and hands the
 * bytes to {@link importFiles}.
 */
export const toBeImportedFiles: NonNullable<(typeof plugin)["toBeImportedFiles"]> = async ({ settings }) => {
  const setting = settings[PLUGIN_KEY]?.pathPattern;
  const pathPatterns = setting ? (Array.isArray(setting) ? setting : [setting]) : [];

  const result: Array<{ path: string; locale: string }> = [];
  for (const pathPattern of pathPatterns) {
    for (const locale of settings.locales) {
      result.push({
        locale,
        path: pathPattern.replace(/\{(locale|languageTag)\}/g, locale),
      });
    }
  }
  return result;
};
