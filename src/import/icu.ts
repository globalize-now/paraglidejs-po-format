import {
  parse,
  TYPE,
  type MessageFormatElement,
  type PluralElement,
  type SelectElement,
} from "@formatjs/icu-messageformat-parser";
import type { Declaration, FunctionReference, Match, Pattern, VariableReference } from "@inlang/sdk";
import { addDeclaration, addInputVariable, inputVariable } from "./declarations.js";

export interface IcuMessage {
  selectors: VariableReference[];
  declarations: Declaration[];
  variants: { matches: Match[]; pattern: Pattern }[];
}

/** What kind of selecting argument this is — distinguishes nodes that share an `arg`. */
type SelectorKind = "plural" | "ordinal" | "select";

/** A selecting argument (plural / selectordinal / select) lifted to an inlang selector. */
interface Selector {
  /** The ICU argument name (the input variable). */
  arg: string;
  /** Cardinal plural, ordinal plural, or select. Two selectors may share `arg` but not `kind`. */
  kind: SelectorKind;
  /** The variable referenced by `selectors` and each `matches[].key`. */
  name: string;
  /** Option keys in document order (CLDR keywords or select cases); excludes exact `=N`. */
  keys: string[];
  /** The key that becomes the catch-all variant (`other`), or undefined if none exists. */
  catchall: string | undefined;
  /** The declaration that introduces `name` (plural local-variable, or the input variable for select). */
  declaration: Declaration;
}

const CATCHALL_KEY = "other";

/**
 * Parses an ICU MessageFormat string into the inlang message shape
 * (`selectors` / `declarations` / `variants`).
 *
 * Supports arguments (`{name}`), `plural` / `selectordinal` / `select` (including
 * nesting, flattened into a cross-product of variants), the `#` token, and
 * `number` / `date` / `time` formatting (mapped to local-variable formatters).
 *
 * A malformed string (or one whose braces are not valid ICU) is returned
 * verbatim as a single literal-text variant, so an odd `msgstr` survives import
 * instead of crashing the build.
 */
export function parseIcuMessage(message: string): IcuMessage {
  let ast: MessageFormatElement[];
  try {
    ast = parse(message, { requiresOtherClause: false, shouldParseSkeletons: true, ignoreTag: true });
  } catch {
    return literalFallback(message);
  }

  const selectors = collectSelectors(ast);

  // A selecting node with no usable keys (e.g. a plural whose only cases are exact
  // `=N` matches) can't be represented and would otherwise collapse the variant
  // cross-product to nothing. Keep the whole string literal instead.
  if (selectors.some((selector) => selector.keys.length === 0)) {
    return literalFallback(message);
  }

  const declarations: Declaration[] = [];
  for (const selector of selectors) {
    addInputVariable(declarations, selector.arg);
    addDeclaration(declarations, selector.declaration);
  }

  const variants = cartesian(selectors.map((s) => s.keys)).map((combo) => ({
    matches: selectors.map((selector, i) => toMatch(selector, combo[i]!)),
    pattern: renderBranch(ast, selectors, combo, declarations, []),
  }));

  return { selectors: selectors.map((s) => ({ type: "variable-reference", name: s.name })), declarations, variants };
}

function literalFallback(message: string): IcuMessage {
  return { selectors: [], declarations: [], variants: [{ matches: [], pattern: [{ type: "text", value: message }] }] };
}

/**
 * Parses a single flat ICU form (e.g. one gettext `msgstr[N]`) into one pattern,
 * without expanding selectors. A form containing a top-level `plural`/`select` is
 * unsupported — the gettext array already provides the plural selection — so it is
 * kept as literal text, as is a malformed form.
 */
export function parseIcuLeaf(message: string): { pattern: Pattern; declarations: Declaration[] } {
  let ast: MessageFormatElement[];
  try {
    ast = parse(message, { requiresOtherClause: false, shouldParseSkeletons: true, ignoreTag: true });
  } catch {
    return { pattern: [{ type: "text", value: message }], declarations: [] };
  }

  if (collectSelectors(ast).length > 0) {
    return { pattern: [{ type: "text", value: message }], declarations: [] };
  }

  const declarations: Declaration[] = [];
  const pattern = renderBranch(ast, [], [], declarations, []);
  return { pattern, declarations };
}

/* ------------------------------------------------------------------ *
 * Selector collection                                                *
 * ------------------------------------------------------------------ */

/** A selecting node before names are assigned; deduped by (`arg`, `kind`), keys unioned. */
interface RawSelector {
  arg: string;
  kind: SelectorKind;
  keys: string[];
  catchall: string | undefined;
}

function collectSelectors(ast: MessageFormatElement[]): Selector[] {
  const raw: RawSelector[] = [];
  collectRawSelectors(ast, raw);

  // Every input-variable name in the message; a synthesized plural local name must
  // not collide with one (nor with a `select` selector, whose name *is* its arg).
  const reserved = new Set<string>();
  collectVariableNames(ast, reserved);
  for (const node of raw) {
    if (node.kind === "select") reserved.add(node.arg);
  }

  const used = new Set<string>();
  return raw.map((node) => {
    if (node.kind === "select") {
      // A select matches the raw value, so the selector is the input variable itself.
      return { ...node, name: node.arg, declaration: inputVariable(node.arg) };
    }
    // plural / selectordinal: a local variable applying the `plural` function.
    const name = uniqueName(`${node.arg}${node.kind === "ordinal" ? "Ordinal" : "Plural"}`, reserved, used);
    used.add(name);
    const options = node.kind === "ordinal" ? [option("type", "ordinal")] : [];
    return {
      ...node,
      name,
      declaration: {
        type: "local-variable",
        name,
        value: {
          type: "expression",
          arg: { type: "variable-reference", name: node.arg },
          annotation: { type: "function-reference", name: "plural", options },
        },
      },
    };
  });
}

/** Collects selecting nodes in document order, deduping by (`arg`, `kind`) and unioning option keys. */
function collectRawSelectors(elements: MessageFormatElement[], raw: RawSelector[]): void {
  for (const element of elements) {
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      const kind = selectorKind(element);
      const existing = raw.find((node) => node.arg === element.value && node.kind === kind);
      const target = existing ?? { arg: element.value, kind, keys: [], catchall: undefined };
      for (const key of optionKeys(element)) {
        if (!target.keys.includes(key)) target.keys.push(key);
      }
      target.catchall = target.keys.includes(CATCHALL_KEY) ? CATCHALL_KEY : undefined;
      if (existing === undefined) raw.push(target);
      for (const key of Object.keys(element.options)) {
        collectRawSelectors(element.options[key]!.value, raw);
      }
    }
  }
}

/** Collects every input-variable name (arguments, formatters, and selector args). */
function collectVariableNames(elements: MessageFormatElement[], names: Set<string>): void {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        names.add(element.value);
        break;
      case TYPE.plural:
      case TYPE.select:
        names.add(element.value);
        for (const key of Object.keys(element.options)) {
          collectVariableNames(element.options[key]!.value, names);
        }
        break;
      default:
        break;
    }
  }
}

function selectorKind(element: PluralElement | SelectElement): SelectorKind {
  if (element.type === TYPE.select) return "select";
  return element.pluralType === "ordinal" ? "ordinal" : "plural";
}

/** Picks `base`, else `base2`, `base3`, … skipping reserved input-variable names and already-used selector names. */
function uniqueName(base: string, reserved: Set<string>, used: Set<string>): string {
  for (let i = 0; ; i += 1) {
    const candidate = i === 0 ? base : `${base}${i + 1}`;
    if (!reserved.has(candidate) && !used.has(candidate)) return candidate;
  }
}

/** Option keys in document order, dropping exact `=N` matches (Paraglide matches CLDR keywords only, so exact cases are not representable). */
function optionKeys(element: PluralElement | SelectElement): string[] {
  return Object.keys(element.options).filter((key) => !key.startsWith("="));
}

function toMatch(selector: Selector, key: string): Match {
  if (key === selector.catchall) return { type: "catchall-match", key: selector.name };
  return { type: "literal-match", key: selector.name, value: key };
}

/* ------------------------------------------------------------------ *
 * Branch rendering (one combination of selector keys)                *
 * ------------------------------------------------------------------ */

/**
 * Renders the pattern for one cross-product combination. At each selecting node
 * it descends into the branch chosen for that selector (falling back to `other`),
 * concatenating a flat pattern. `pluralStack` tracks the enclosing plural args so
 * `#` resolves to the right variable.
 */
function renderBranch(
  elements: MessageFormatElement[],
  selectors: Selector[],
  combo: string[],
  declarations: Declaration[],
  pluralStack: string[],
): Pattern {
  const pattern: Pattern = [];
  for (const element of elements) {
    switch (element.type) {
      case TYPE.literal:
        pattern.push({ type: "text", value: element.value });
        break;
      case TYPE.argument:
        addInputVariable(declarations, element.value);
        pattern.push({ type: "expression", arg: { type: "variable-reference", name: element.value } });
        break;
      case TYPE.pound: {
        const arg = pluralStack[pluralStack.length - 1];
        if (arg === undefined) {
          pattern.push({ type: "text", value: "#" });
        } else {
          pattern.push({ type: "expression", arg: { type: "variable-reference", name: arg } });
        }
        break;
      }
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        pattern.push(formatExpression(element, declarations));
        break;
      case TYPE.select:
      case TYPE.plural: {
        const kind = selectorKind(element);
        const selectorIndex = selectors.findIndex((s) => s.arg === element.value && s.kind === kind);
        const key = combo[selectorIndex]!;
        const branch = element.options[key] ?? element.options[CATCHALL_KEY];
        if (branch === undefined) break;
        const nextStack = element.type === TYPE.plural ? [...pluralStack, element.value] : pluralStack;
        pattern.push(...renderBranch(branch.value, selectors, combo, declarations, nextStack));
        break;
      }
      default:
        break;
    }
  }
  return pattern;
}

/* ------------------------------------------------------------------ *
 * Formatting (number / date / time → local-variable formatters)      *
 * ------------------------------------------------------------------ */

type FormatElement = Extract<MessageFormatElement, { type: typeof TYPE.number | typeof TYPE.date | typeof TYPE.time }>;

function formatExpression(element: FormatElement, declarations: Declaration[]): Pattern[number] {
  addInputVariable(declarations, element.value);
  const annotation = formatAnnotation(element);
  const name = uniqueLocalName(declarations, `${element.value}Formatted`, annotation);
  addDeclaration(declarations, {
    type: "local-variable",
    name,
    value: { type: "expression", arg: { type: "variable-reference", name: element.value }, annotation },
  });
  return { type: "expression", arg: { type: "variable-reference", name } };
}

function formatAnnotation(element: FormatElement): FunctionReference {
  const name = element.type === TYPE.number ? "number" : "datetime";
  return { type: "function-reference", name, options: styleOptions(element) };
}

function styleOptions(element: FormatElement): FunctionReference["options"] {
  const style = element.style;
  if (style === null || style === undefined) return [];

  if (typeof style === "string") {
    if (element.type === TYPE.date) return [option("dateStyle", style)];
    if (element.type === TYPE.time) return [option("timeStyle", style)];
    return [option("style", style)];
  }

  // Parsed skeleton: forward the resolved Intl options.
  return Object.entries(style.parsedOptions).map(([key, value]) => option(key, String(value)));
}

/** Picks a local-variable name, reusing an existing one only when its formatter matches. */
function uniqueLocalName(declarations: Declaration[], base: string, annotation: FunctionReference): string {
  for (let i = 0; ; i += 1) {
    const candidate = i === 0 ? base : `${base}${i + 1}`;
    const existing = declarations.find((d) => d.name === candidate);
    if (existing === undefined) return candidate;
    if (existing.type === "local-variable" && sameAnnotation(existing.value.annotation, annotation)) return candidate;
  }
}

function sameAnnotation(a: FunctionReference | undefined, b: FunctionReference): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ------------------------------------------------------------------ *
 * Small helpers                                                      *
 * ------------------------------------------------------------------ */

function option(name: string, value: string): { name: string; value: { type: "literal"; value: string } } {
  return { name, value: { type: "literal", value } };
}

/** Cartesian product of key lists. Empty input yields a single empty combination. */
function cartesian(lists: string[][]): string[][] {
  return lists.reduce<string[][]>((acc, list) => acc.flatMap((combo) => list.map((key) => [...combo, key])), [[]]);
}
