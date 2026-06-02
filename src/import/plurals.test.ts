import { describe, expect, it } from "vitest";
import { buildPluralCategories, parsePluralForms } from "./plurals.js";

describe("parsePluralForms", () => {
  it("compiles the English 2-form expression", () => {
    const forms = parsePluralForms("nplurals=2; plural=(n != 1);");
    expect(forms?.nplurals).toBe(2);
    expect(forms?.select(1)).toBe(0);
    expect(forms?.select(0)).toBe(1);
    expect(forms?.select(2)).toBe(1);
  });

  it("compiles the Latvian 3-form expression", () => {
    const forms = parsePluralForms(
      "nplurals=3; plural=(n % 10 == 0 || n % 100 >= 11 && n % 100 <= 19 ? 0 : n % 10 == 1 && n % 100 != 11 ? 1 : 2);",
    );
    expect(forms?.nplurals).toBe(3);
    expect(forms?.select(0)).toBe(0); // zero
    expect(forms?.select(10)).toBe(0); // zero
    expect(forms?.select(11)).toBe(0); // zero (n%100 in 11..19)
    expect(forms?.select(1)).toBe(1); // one
    expect(forms?.select(21)).toBe(1); // one
    expect(forms?.select(2)).toBe(2); // other
  });

  it("returns undefined for missing or malformed headers", () => {
    expect(parsePluralForms(undefined)).toBeUndefined();
    expect(parsePluralForms("garbage")).toBeUndefined();
  });

  it("rejects unsafe expressions instead of evaluating them", () => {
    // not a valid plural expression -> should fail to compile -> undefined
    expect(parsePluralForms("nplurals=2; plural=process.exit(1);")).toBeUndefined();
  });
});

describe("buildPluralCategories", () => {
  it("maps English forms to one / other with other as catchall", () => {
    const categories = buildPluralCategories("en", "nplurals=2; plural=(n != 1);");
    expect(categories).toEqual([
      { category: "one", catchall: false },
      { category: "other", catchall: true },
    ]);
  });

  it("maps Latvian forms to zero / one / other with other as catchall", () => {
    const categories = buildPluralCategories(
      "lv",
      "nplurals=3; plural=(n % 10 == 0 || n % 100 >= 11 && n % 100 <= 19 ? 0 : n % 10 == 1 && n % 100 != 11 ? 1 : 2);",
    );
    expect(categories.map((c) => c.category)).toEqual(["zero", "one", "other"]);
    expect(categories.map((c) => c.catchall)).toEqual([false, false, true]);
  });

  it("falls back to the locale's CLDR categories when no header is present", () => {
    const categories = buildPluralCategories("en", undefined);
    expect(categories).toEqual([
      { category: "one", catchall: false },
      { category: "other", catchall: true },
    ]);
  });
});
