import { po as gettextPo } from "gettext-parser";
import type { Bundle, Declaration, Match, MessageImport, Pattern, VariantImport } from "@inlang/sdk";
import { PLUGIN_KEY, type plugin } from "../plugin.js";
import type { PluginSettings } from "../settings.js";
import { addDeclaration } from "./declarations.js";
import { parseIcuLeaf, parseIcuMessage } from "./icu.js";
import { parsePattern } from "./parsePattern.js";
import { buildPluralCategories } from "./plurals.js";
import { bundleId } from "./bundleId.js";

/** Name of the synthesized plural input variable (the gettext count). */
const COUNT_VARIABLE = "count";
/** Name of the synthesized plural selector (local variable `count : plural`). */
const PLURAL_SELECTOR = "countPlural";

/** How `msgstr` values are parsed (`plain` | `icu`), derived from the plugin settings schema. */
type MessageFormat = NonNullable<PluginSettings["messageFormat"]>;

/**
 * Imports gettext PO files into the inlang data model.
 *
 * Each PO entry becomes a Bundle (id derived from `msgctxt`/`msgid`); each file
 * contributes one Message per Bundle for its locale; `msgstr` values become
 * Variants.
 *
 * gettext-native plurals (`msgid_plural` / `msgstr[N]`) always gain a `count`
 * selector and one Variant per CLDR category. How each `msgstr` string is parsed
 * depends on the `messageFormat` setting: `plain` (default) reads `{name}`
 * placeholders only (see {@link parsePattern}); `icu` parses singular `msgstr`
 * values as ICU MessageFormat, adding inline `plural` / `select` / `selectordinal`
 * and `number` / `date` / `time` formatting (see {@link parseIcuMessage}).
 */
export const importFiles: NonNullable<(typeof plugin)["importFiles"]> = async ({ files, settings }) => {
  const bundles: Bundle[] = [];
  const messages: MessageImport[] = [];
  const variants: VariantImport[] = [];
  const format: MessageFormat = settings[PLUGIN_KEY]?.messageFormat ?? "plain";

  for (const file of files) {
    const parsed = gettextPo.parse(new TextDecoder().decode(file.content));
    const pluralFormsHeader = headerValue(parsed.headers, "plural-forms");

    for (const context of Object.keys(parsed.translations)) {
      const entries = parsed.translations[context]!;
      for (const msgid of Object.keys(entries)) {
        // Skip the PO header entry (context "", msgid "").
        if (context === "" && msgid === "") continue;

        const entry = entries[msgid]!;
        const id = bundleId(context || undefined, msgid);
        const isPlural = typeof entry.msgid_plural === "string" && entry.msgid_plural.length > 0;

        // Skip untranslated entries so the message falls back to the base locale at
        // runtime instead of rendering an empty string. For a singular that means an
        // empty `msgstr`; for a plural, ANY empty form would leave one CLDR category
        // (often the catch-all) rendering "", so we require every form to be present.
        if (isUntranslated(entry.msgstr, isPlural)) continue;

        const result = isPlural
          ? parsePluralEntry(id, file.locale, entry.msgstr, pluralFormsHeader, format)
          : parseSingularEntry(id, file.locale, entry.msgstr[0] ?? "", format);

        messages.push(result.message);
        variants.push(...result.variants);
        mergeBundle(bundles, id, result.declarations);
      }
    }
  }

  return { bundles, messages, variants };
};

function parseSingularEntry(
  id: string,
  locale: string,
  msgstr: string,
  format: MessageFormat,
): { message: MessageImport; variants: VariantImport[]; declarations: Declaration[] } {
  if (format === "plain") {
    const { pattern, declarations } = parsePattern(msgstr);
    return {
      message: { bundleId: id, locale, selectors: [] },
      variants: [{ messageBundleId: id, messageLocale: locale, matches: [], pattern }],
      declarations,
    };
  }

  const { selectors, declarations, variants } = parseIcuMessage(msgstr);
  return {
    message: { bundleId: id, locale, selectors },
    variants: variants.map((variant) => ({
      messageBundleId: id,
      messageLocale: locale,
      matches: variant.matches,
      pattern: variant.pattern,
    })),
    declarations,
  };
}

function parsePluralEntry(
  id: string,
  locale: string,
  msgstrs: string[],
  pluralFormsHeader: string | undefined,
  format: MessageFormat,
): { message: MessageImport; variants: VariantImport[]; declarations: Declaration[] } {
  const categories = buildPluralCategories(locale, pluralFormsHeader);
  const declarations: Declaration[] = [{ type: "input-variable", name: COUNT_VARIABLE }, pluralSelectorDeclaration()];
  const variants: VariantImport[] = [];

  msgstrs.forEach((msgstr, index) => {
    const { pattern, declarations: leafDeclarations } = parsePluralLeaf(msgstr, format);
    for (const declaration of leafDeclarations) {
      addDeclaration(declarations, declaration);
    }
    variants.push({
      messageBundleId: id,
      messageLocale: locale,
      matches: [pluralMatch(categories[index])],
      pattern,
    });
  });

  return {
    message: {
      bundleId: id,
      locale,
      selectors: [{ type: "variable-reference", name: PLURAL_SELECTOR }],
    },
    variants,
    declarations,
  };
}

/**
 * Parses a single gettext plural form (`msgstr[N]`) into a leaf pattern. The gettext
 * array already provides the plural selection, so each form is a flat pattern: `plain`
 * mode reads `{name}` placeholders (see {@link parsePattern}); `icu` mode parses a flat
 * ICU form (see {@link parseIcuLeaf}), keeping a nested top-level `plural`/`select` as
 * literal text rather than adding a second selector.
 */
function parsePluralLeaf(msgstr: string, format: MessageFormat): { pattern: Pattern; declarations: Declaration[] } {
  return format === "plain" ? parsePattern(msgstr) : parseIcuLeaf(msgstr);
}

function pluralMatch(category: { category: string; catchall: boolean } | undefined): Match {
  // Unknown index (more msgstr entries than nplurals) → safe catch-all.
  if (category === undefined || category.catchall) {
    return { type: "catchall-match", key: PLURAL_SELECTOR };
  }
  return { type: "literal-match", key: PLURAL_SELECTOR, value: category.category };
}

function pluralSelectorDeclaration(): Declaration {
  return {
    type: "local-variable",
    name: PLURAL_SELECTOR,
    value: {
      type: "expression",
      arg: { type: "variable-reference", name: COUNT_VARIABLE },
      annotation: { type: "function-reference", name: "plural", options: [] },
    },
  };
}

function mergeBundle(bundles: Bundle[], id: string, declarations: Declaration[]): void {
  const existing = bundles.find((bundle) => bundle.id === id);
  if (existing === undefined) {
    bundles.push({ id, declarations: [...declarations] });
    return;
  }
  for (const declaration of declarations) {
    addDeclaration(existing.declarations, declaration);
  }
}

/**
 * Whether a PO entry is untranslated and should be skipped. A singular needs a
 * non-empty `msgstr`; a plural needs every form translated (a missing form would
 * leave a CLDR category rendering an empty string instead of falling back).
 */
function isUntranslated(msgstr: string[], isPlural: boolean): boolean {
  const isEmpty = (value: string | undefined) => value === undefined || value === "";
  if (isPlural) return msgstr.length === 0 || msgstr.some(isEmpty);
  return isEmpty(msgstr[0]);
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  // gettext-parser lowercases header names, so we look up the lowercase form.
  return headers?.[name.toLowerCase()];
}
