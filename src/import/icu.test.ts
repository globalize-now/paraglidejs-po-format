import { describe, expect, it } from "vitest";
import { parseIcuLeaf, parseIcuMessage } from "./icu.js";

describe("parseIcuMessage", () => {
  it("parses a plain string into a single text node with no selectors", () => {
    const { selectors, declarations, variants } = parseIcuMessage("Hello world");
    expect(selectors).toEqual([]);
    expect(declarations).toEqual([]);
    expect(variants).toEqual([{ matches: [], pattern: [{ type: "text", value: "Hello world" }] }]);
  });

  it("parses a {name} argument into an expression node and input declaration", () => {
    const { selectors, declarations, variants } = parseIcuMessage("Hello {name}");
    expect(selectors).toEqual([]);
    expect(declarations).toEqual([{ type: "input-variable", name: "name" }]);
    expect(variants).toEqual([
      {
        matches: [],
        pattern: [
          { type: "text", value: "Hello " },
          { type: "expression", arg: { type: "variable-reference", name: "name" } },
        ],
      },
    ]);
  });

  it("parses a plural into a countPlural selector with one variant per category", () => {
    const result = parseIcuMessage("{count, plural, one {# apple} other {# apples}}");

    expect(result.selectors).toEqual([{ type: "variable-reference", name: "countPlural" }]);
    expect(result.declarations).toEqual([
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
    expect(result.variants).toEqual([
      {
        matches: [{ type: "literal-match", key: "countPlural", value: "one" }],
        pattern: [
          { type: "expression", arg: { type: "variable-reference", name: "count" } },
          { type: "text", value: " apple" },
        ],
      },
      {
        matches: [{ type: "catchall-match", key: "countPlural" }],
        pattern: [
          { type: "expression", arg: { type: "variable-reference", name: "count" } },
          { type: "text", value: " apples" },
        ],
      },
    ]);
  });

  it("maps a select onto the input variable directly with `other` as catch-all", () => {
    const result = parseIcuMessage("{g, select, male {he} female {she} other {they}}");

    expect(result.selectors).toEqual([{ type: "variable-reference", name: "g" }]);
    expect(result.declarations).toEqual([{ type: "input-variable", name: "g" }]);
    expect(result.variants).toEqual([
      { matches: [{ type: "literal-match", key: "g", value: "male" }], pattern: [{ type: "text", value: "he" }] },
      { matches: [{ type: "literal-match", key: "g", value: "female" }], pattern: [{ type: "text", value: "she" }] },
      { matches: [{ type: "catchall-match", key: "g" }], pattern: [{ type: "text", value: "they" }] },
    ]);
  });

  it("maps selectordinal to a plural function with a type=ordinal option", () => {
    const result = parseIcuMessage("{n, selectordinal, one {#st} other {#th}}");

    expect(result.selectors).toEqual([{ type: "variable-reference", name: "nOrdinal" }]);
    expect(result.declarations).toEqual([
      { type: "input-variable", name: "n" },
      {
        type: "local-variable",
        name: "nOrdinal",
        value: {
          type: "expression",
          arg: { type: "variable-reference", name: "n" },
          annotation: {
            type: "function-reference",
            name: "plural",
            options: [{ name: "type", value: { type: "literal", value: "ordinal" } }],
          },
        },
      },
    ]);
    expect(result.variants.map((v) => v.matches)).toEqual([
      [{ type: "literal-match", key: "nOrdinal", value: "one" }],
      [{ type: "catchall-match", key: "nOrdinal" }],
    ]);
  });

  it("flattens nested plural x select into a cross-product of variants", () => {
    const result = parseIcuMessage("{c, plural, one {# item by {g, select, male {him} other {them}}} other {# items}}");

    expect(result.selectors).toEqual([
      { type: "variable-reference", name: "cPlural" },
      { type: "variable-reference", name: "g" },
    ]);
    // 2 plural categories x 2 select cases = 4 variants.
    expect(result.variants.map((v) => v.matches)).toEqual([
      [
        { type: "literal-match", key: "cPlural", value: "one" },
        { type: "literal-match", key: "g", value: "male" },
      ],
      [
        { type: "literal-match", key: "cPlural", value: "one" },
        { type: "catchall-match", key: "g" },
      ],
      [
        { type: "catchall-match", key: "cPlural" },
        { type: "literal-match", key: "g", value: "male" },
      ],
      [
        { type: "catchall-match", key: "cPlural" },
        { type: "catchall-match", key: "g" },
      ],
    ]);
    // The `one` branch resolves the nested select; the `other` branch ignores it.
    expect(result.variants[0]!.pattern).toEqual([
      { type: "expression", arg: { type: "variable-reference", name: "c" } },
      { type: "text", value: " item by " },
      { type: "text", value: "him" },
    ]);
    expect(result.variants[3]!.pattern).toEqual([
      { type: "expression", arg: { type: "variable-reference", name: "c" } },
      { type: "text", value: " items" },
    ]);
  });

  it("keeps both a cardinal and an ordinal selector on the same argument", () => {
    // Same arg `n`, different selecting kinds: deduping by arg alone would drop the
    // selectordinal and mis-render it; they must stay distinct (nPlural vs nOrdinal).
    const result = parseIcuMessage("{n, plural, one {a} other {b}} {n, selectordinal, one {c} other {d}}");

    expect(result.selectors).toEqual([
      { type: "variable-reference", name: "nPlural" },
      { type: "variable-reference", name: "nOrdinal" },
    ]);
    expect(result.variants.map((v) => v.matches)).toEqual([
      [
        { type: "literal-match", key: "nPlural", value: "one" },
        { type: "literal-match", key: "nOrdinal", value: "one" },
      ],
      [
        { type: "literal-match", key: "nPlural", value: "one" },
        { type: "catchall-match", key: "nOrdinal" },
      ],
      [
        { type: "catchall-match", key: "nPlural" },
        { type: "literal-match", key: "nOrdinal", value: "one" },
      ],
      [
        { type: "catchall-match", key: "nPlural" },
        { type: "catchall-match", key: "nOrdinal" },
      ],
    ]);
    // nPlural=one, nOrdinal=one renders the cardinal `a` and the ordinal `c`.
    expect(result.variants[0]!.pattern).toEqual([
      { type: "text", value: "a" },
      { type: "text", value: " " },
      { type: "text", value: "c" },
    ]);
  });

  it("disambiguates a synthesized plural selector name that collides with another argument", () => {
    // The plural on `count` wants the local-variable name `countPlural`, but a separate
    // `select` argument is literally named `countPlural`. The plural local must be renamed
    // so the two selectors don't share a key / swallow each other's declaration.
    const result = parseIcuMessage("{count, plural, one {a} other {b}} {countPlural, select, x {c} other {d}}");

    expect(result.selectors).toEqual([
      { type: "variable-reference", name: "countPlural2" },
      { type: "variable-reference", name: "countPlural" },
    ]);
    expect(result.declarations.map((d) => `${d.type}:${d.name}`)).toEqual([
      "input-variable:count",
      "local-variable:countPlural2",
      "input-variable:countPlural",
    ]);
    // Each variant's matches key off the disambiguated names, so the two selectors stay distinct.
    expect(result.variants.map((v) => v.matches)).toEqual([
      [
        { type: "literal-match", key: "countPlural2", value: "one" },
        { type: "literal-match", key: "countPlural", value: "x" },
      ],
      [
        { type: "literal-match", key: "countPlural2", value: "one" },
        { type: "catchall-match", key: "countPlural" },
      ],
      [
        { type: "catchall-match", key: "countPlural2" },
        { type: "literal-match", key: "countPlural", value: "x" },
      ],
      [
        { type: "catchall-match", key: "countPlural2" },
        { type: "catchall-match", key: "countPlural" },
      ],
    ]);
  });

  it("unions option keys when the same select argument is reused across sibling branches", () => {
    // `g` is selected in both the `a` and `b` branches with different cases. Deduping by
    // arg must union the case sets, otherwise the `female`-only branch is never enumerated.
    const message = "{x, select, a {{g, select, male {M} other {O}}} b {{g, select, female {F} other {P}}} other {Z}}";
    const result = parseIcuMessage(message);

    const rendered = result.variants.map((v) => v.pattern.map((n) => (n.type === "text" ? n.value : "·")).join(""));
    // Both branch-specific cases are reachable.
    expect(rendered).toContain("F");
    expect(rendered).toContain("M");
  });

  it("maps a number skeleton to a local-variable formatter", () => {
    const result = parseIcuMessage("Price: {amt, number, ::currency/EUR}");

    expect(result.selectors).toEqual([]);
    expect(result.declarations).toEqual([
      { type: "input-variable", name: "amt" },
      {
        type: "local-variable",
        name: "amtFormatted",
        value: {
          type: "expression",
          arg: { type: "variable-reference", name: "amt" },
          annotation: {
            type: "function-reference",
            name: "number",
            options: [
              { name: "style", value: { type: "literal", value: "currency" } },
              { name: "currency", value: { type: "literal", value: "EUR" } },
            ],
          },
        },
      },
    ]);
    expect(result.variants[0]!.pattern).toEqual([
      { type: "text", value: "Price: " },
      { type: "expression", arg: { type: "variable-reference", name: "amtFormatted" } },
    ]);
  });

  it("maps a date style to a datetime formatter with dateStyle", () => {
    const result = parseIcuMessage("{d, date, short}");

    expect(result.declarations).toEqual([
      { type: "input-variable", name: "d" },
      {
        type: "local-variable",
        name: "dFormatted",
        value: {
          type: "expression",
          arg: { type: "variable-reference", name: "d" },
          annotation: {
            type: "function-reference",
            name: "datetime",
            options: [{ name: "dateStyle", value: { type: "literal", value: "short" } }],
          },
        },
      },
    ]);
  });

  it("maps a time style to a datetime formatter with timeStyle", () => {
    const result = parseIcuMessage("{t, time, medium}");

    expect(result.declarations).toEqual([
      { type: "input-variable", name: "t" },
      {
        type: "local-variable",
        name: "tFormatted",
        value: {
          type: "expression",
          arg: { type: "variable-reference", name: "t" },
          annotation: {
            type: "function-reference",
            name: "datetime",
            options: [{ name: "timeStyle", value: { type: "literal", value: "medium" } }],
          },
        },
      },
    ]);
  });

  it("treats apostrophe-quoted braces as literal text (ICU escaping)", () => {
    const result = parseIcuMessage("price '{'x'}'");
    expect(result.variants).toEqual([{ matches: [], pattern: [{ type: "text", value: "price {x}" }] }]);
  });

  it("drops exact =N plural matches, keeping the CLDR keyword branches", () => {
    const result = parseIcuMessage("{count, plural, =0 {none} one {# apple} other {# apples}}");
    expect(result.variants.map((v) => v.matches)).toEqual([
      [{ type: "literal-match", key: "countPlural", value: "one" }],
      [{ type: "catchall-match", key: "countPlural" }],
    ]);
  });

  it("falls back to literal text when the string is not valid ICU", () => {
    const result = parseIcuMessage("a {1,2} b");
    expect(result.selectors).toEqual([]);
    expect(result.declarations).toEqual([]);
    expect(result.variants).toEqual([{ matches: [], pattern: [{ type: "text", value: "a {1,2} b" }] }]);
  });

  it("falls back to literal text when a plural has only exact =N cases (not representable)", () => {
    // Every option is `=N`; after dropping them no CLDR keyword remains, so the plural
    // cannot be represented. Keep the whole string literal instead of emitting a selector
    // with zero variants.
    const message = "{count, plural, =0 {none} =1 {one apple}}";
    const result = parseIcuMessage(message);
    expect(result.selectors).toEqual([]);
    expect(result.declarations).toEqual([]);
    expect(result.variants).toEqual([{ matches: [], pattern: [{ type: "text", value: message }] }]);
  });

  it("does not let an =N-only plural annihilate a valid sibling selector", () => {
    // The `=N`-only first plural can't be represented; without the guard the empty key
    // list collapses the cartesian product and the valid second plural is dropped too.
    const message = "{c, plural, =0 {none}} and {count, plural, one {a} other {b}}";
    const result = parseIcuMessage(message);
    expect(result.variants).toEqual([{ matches: [], pattern: [{ type: "text", value: message }] }]);
  });
});

describe("parseIcuLeaf", () => {
  it("parses a flat string with arguments into a single pattern and declarations", () => {
    const result = parseIcuLeaf("Hello {name}");
    expect(result.declarations).toEqual([{ type: "input-variable", name: "name" }]);
    expect(result.pattern).toEqual([
      { type: "text", value: "Hello " },
      { type: "expression", arg: { type: "variable-reference", name: "name" } },
    ]);
  });

  it("parses inline number formatting in a flat form", () => {
    const result = parseIcuLeaf("{amt, number, ::percent}");
    expect(result.declarations).toEqual([
      { type: "input-variable", name: "amt" },
      {
        type: "local-variable",
        name: "amtFormatted",
        value: {
          type: "expression",
          arg: { type: "variable-reference", name: "amt" },
          annotation: {
            type: "function-reference",
            name: "number",
            options: [{ name: "style", value: { type: "literal", value: "percent" } }],
          },
        },
      },
    ]);
    expect(result.pattern).toEqual([{ type: "expression", arg: { type: "variable-reference", name: "amtFormatted" } }]);
  });

  it("keeps a form with a top-level selector as literal text (unsupported nesting)", () => {
    // The gettext array already drives plural selection; a nested top-level ICU plural
    // inside one form can't add another selector, so keep it literal rather than drop it.
    const message = "{count, plural, one {x} other {y}}";
    const result = parseIcuLeaf(message);
    expect(result.declarations).toEqual([]);
    expect(result.pattern).toEqual([{ type: "text", value: message }]);
  });

  it("keeps a malformed form as literal text", () => {
    const result = parseIcuLeaf("a {1,2} b");
    expect(result.declarations).toEqual([]);
    expect(result.pattern).toEqual([{ type: "text", value: "a {1,2} b" }]);
  });
});
