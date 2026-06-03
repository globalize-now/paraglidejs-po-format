import type { Declaration, Pattern } from "@inlang/sdk";
import { inputVariable } from "./declarations.js";

const PLACEHOLDER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Parses a translation string with brace placeholders (`"Hello {name}"`) into an
 * inlang {@link Pattern} (an array of `text` / `expression` nodes). This is the
 * default ("plain") message parser; ICU MessageFormat is opt-in via the
 * `messageFormat: "icu"` setting (see {@link parseIcuMessage}).
 *
 * - `{name}` becomes an `expression` wrapping a `variable-reference`, as long as
 *   `name` is a valid identifier. Anything else (`{`, `{ }`, `{1,2}`, …) is kept
 *   as literal text, so JSON-ish or punctuation-heavy source strings survive.
 * - `\{`, `\}` and `\\` are escapes for literal `{`, `}` and `\`.
 *
 * Unlike ICU, the apostrophe is not special, so elision languages
 * (`"l'{article}"`) keep their placeholder.
 *
 * Returns the pattern plus the `input-variable` declarations implied by the
 * referenced placeholder names (deduplicated, in first-seen order).
 */
export function parsePattern(value: string): {
  pattern: Pattern;
  declarations: Declaration[];
} {
  const pattern: Pattern = [];
  const names: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.length > 0) {
      pattern.push({ type: "text", value: buffer });
      buffer = "";
    }
  };

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;

    if (char === "\\") {
      const next = value[i + 1];
      if (next === "{" || next === "}" || next === "\\") {
        buffer += next;
        i += 1;
        continue;
      }
      buffer += char;
      continue;
    }

    if (char === "{") {
      const close = value.indexOf("}", i + 1);
      if (close !== -1) {
        const name = value.slice(i + 1, close);
        if (PLACEHOLDER_NAME.test(name)) {
          flush();
          pattern.push({
            type: "expression",
            arg: { type: "variable-reference", name },
          });
          if (!names.includes(name)) {
            names.push(name);
          }
          i = close;
          continue;
        }
      }
      // not a valid placeholder → treat the brace as literal text
      buffer += char;
      continue;
    }

    buffer += char;
  }

  flush();

  const declarations: Declaration[] = names.map(inputVariable);

  return { pattern, declarations };
}
