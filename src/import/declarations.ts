import type { Declaration } from "@inlang/sdk";

/** An `input-variable` declaration for the given name. */
export function inputVariable(name: string): Declaration {
  return { type: "input-variable", name };
}

/** Appends a declaration unless one with the same name already exists (first-seen wins). */
export function addDeclaration(declarations: Declaration[], declaration: Declaration): void {
  if (declarations.some((existing) => existing.name === declaration.name)) return;
  declarations.push(declaration);
}

/** Appends an `input-variable` declaration for `name`, deduplicated by name. */
export function addInputVariable(declarations: Declaration[], name: string): void {
  addDeclaration(declarations, inputVariable(name));
}
