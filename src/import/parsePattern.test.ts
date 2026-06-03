import { describe, expect, it } from "vitest";
import { parsePattern } from "./parsePattern.js";

describe("parsePattern", () => {
  it("parses a plain string into a single text node", () => {
    const { pattern, declarations } = parsePattern("Hello world");
    expect(pattern).toEqual([{ type: "text", value: "Hello world" }]);
    expect(declarations).toEqual([]);
  });

  it("parses a {name} placeholder into an expression node", () => {
    const { pattern, declarations } = parsePattern("Hello {name}");
    expect(pattern).toEqual([
      { type: "text", value: "Hello " },
      { type: "expression", arg: { type: "variable-reference", name: "name" } },
    ]);
    expect(declarations).toEqual([{ type: "input-variable", name: "name" }]);
  });

  it("handles multiple and surrounding placeholders", () => {
    const { pattern } = parsePattern("{greeting}, {name}!");
    expect(pattern).toEqual([
      { type: "expression", arg: { type: "variable-reference", name: "greeting" } },
      { type: "text", value: ", " },
      { type: "expression", arg: { type: "variable-reference", name: "name" } },
      { type: "text", value: "!" },
    ]);
  });

  it("deduplicates declarations for repeated names, preserving order", () => {
    const { declarations } = parsePattern("{a} {b} {a}");
    expect(declarations).toEqual([
      { type: "input-variable", name: "a" },
      { type: "input-variable", name: "b" },
    ]);
  });

  it("treats non-identifier braces as literal text", () => {
    const { pattern, declarations } = parsePattern("a {1,2} b {} c { } d");
    expect(pattern).toEqual([{ type: "text", value: "a {1,2} b {} c { } d" }]);
    expect(declarations).toEqual([]);
  });

  it("supports escaped braces and backslashes", () => {
    const { pattern, declarations } = parsePattern("price: \\{not a var\\} and \\\\");
    expect(pattern).toEqual([{ type: "text", value: "price: {not a var} and \\" }]);
    expect(declarations).toEqual([]);
  });

  it("treats an unterminated brace as literal", () => {
    const { pattern } = parsePattern("a { b");
    expect(pattern).toEqual([{ type: "text", value: "a { b" }]);
  });

  it("leaves an elision apostrophe before a placeholder intact", () => {
    // The ICU footgun this plain mode avoids: l'{article} keeps the variable.
    const { pattern, declarations } = parsePattern("l'{article}");
    expect(pattern).toEqual([
      { type: "text", value: "l'" },
      { type: "expression", arg: { type: "variable-reference", name: "article" } },
    ]);
    expect(declarations).toEqual([{ type: "input-variable", name: "article" }]);
  });

  it("returns an empty pattern for an empty string", () => {
    const { pattern, declarations } = parsePattern("");
    expect(pattern).toEqual([]);
    expect(declarations).toEqual([]);
  });
});
