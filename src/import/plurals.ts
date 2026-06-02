/**
 * Maps gettext numeric plural indices (`msgstr[0]`, `msgstr[1]`, …) onto CLDR
 * plural categories (`one`, `few`, `many`, `other`, …).
 *
 * gettext stores plurals as a numeric array whose selection is driven by the
 * file's `Plural-Forms: nplurals=N; plural=<expr>;` header. inlang/Paraglide
 * instead matches variants on CLDR categories. We bridge the two by compiling
 * the gettext expression and probing it against `Intl.PluralRules` for the
 * locale, deriving a representative CLDR category per index — correct even when
 * a file overrides the default formula.
 */

export interface PluralCategory {
  /** The CLDR category for this gettext index, e.g. "one" / "few" / "other". */
  category: string;
  /** Whether this index should become the catch-all (fallback) variant. */
  catchall: boolean;
}

interface PluralForms {
  nplurals: number;
  /** (n) => plural index */
  select: (n: number) => number;
}

/** Probe range for deriving index→category. Covers all CLDR integer categories. */
const PROBE_MAX = 200;

/**
 * Parses a `Plural-Forms` header value into `nplurals` and a compiled selector.
 * Returns `undefined` if the header is missing or cannot be parsed.
 */
export function parsePluralForms(header: string | undefined): PluralForms | undefined {
  if (!header) return undefined;

  const npluralsMatch = header.match(/nplurals\s*=\s*(\d+)/);
  const pluralMatch = header.match(/plural\s*=\s*([^;]+)/);
  if (!npluralsMatch || !pluralMatch) return undefined;

  const nplurals = Number(npluralsMatch[1]);
  let select: (n: number) => number;
  try {
    select = compilePluralExpression(pluralMatch[1]!.trim());
  } catch {
    return undefined;
  }
  return { nplurals, select };
}

/**
 * Builds the per-index CLDR category list for a locale. `pluralFormsHeader` is
 * the raw `Plural-Forms` value from the PO file (preferred); when absent we fall
 * back to the locale's CLDR categories in their canonical order.
 *
 * The returned array is indexed by gettext plural index. Exactly one entry is
 * marked `catchall` so the resulting message always has a fallback variant: the
 * index whose category is `other`, or the last index if no index maps to `other`.
 */
export function buildPluralCategories(locale: string, pluralFormsHeader: string | undefined): PluralCategory[] {
  const rules = new Intl.PluralRules(locale);
  const forms = parsePluralForms(pluralFormsHeader);

  let categories: string[];

  if (forms) {
    categories = new Array<string>(forms.nplurals);
    const filled = new Array<boolean>(forms.nplurals).fill(false);
    let remaining = forms.nplurals;
    for (let n = 0; n <= PROBE_MAX && remaining > 0; n += 1) {
      const index = forms.select(n);
      if (index >= 0 && index < forms.nplurals && !filled[index]) {
        categories[index] = rules.select(n);
        filled[index] = true;
        remaining -= 1;
      }
    }
    // Any index never produced by the formula falls back to "other".
    for (let i = 0; i < categories.length; i += 1) {
      if (!filled[i]) categories[i] = "other";
    }
  } else {
    // No usable header: use the locale's CLDR categories in canonical order.
    categories = cldrCategoriesInOrder(rules);
  }

  const otherIndex = categories.indexOf("other");
  const catchallIndex = otherIndex !== -1 ? otherIndex : categories.length - 1;

  return categories.map((category, index) => ({
    category,
    catchall: index === catchallIndex,
  }));
}

/** CLDR categories for a locale, ordered one < two < few < many < other. */
function cldrCategoriesInOrder(rules: Intl.PluralRules): string[] {
  const order = ["zero", "one", "two", "few", "many", "other"];
  const present = new Set<string>(rules.resolvedOptions().pluralCategories);
  return order.filter((category) => present.has(category));
}

/* ------------------------------------------------------------------ *
 * A small, safe evaluator for gettext plural expressions.            *
 * Grammar (C subset over the single variable `n`):                   *
 *   ?:  ||  &&  == !=  < > <= >=  + -  * / %  unary !  ( )  integers  *
 * Implemented as precedence-climbing producing closures, so we never *
 * use eval/new Function (CSP- and bundler-safe).                     *
 * ------------------------------------------------------------------ */

type Node = (n: number) => number;

const TOKEN = /\s*(\d+|<=|>=|==|!=|&&|\|\||[-+*/%<>!?:()])/y;

function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let pos = 0;
  while (pos < expr.length) {
    TOKEN.lastIndex = pos;
    const match = TOKEN.exec(expr);
    if (!match || match.index !== pos) {
      // allow the bare variable `n`
      const slice = expr.slice(pos);
      const nMatch = slice.match(/^\s*n/);
      if (nMatch) {
        tokens.push("n");
        pos += nMatch[0].length;
        continue;
      }
      throw new Error(`Unexpected token in plural expression near: "${expr.slice(pos)}"`);
    }
    tokens.push(match[1]!);
    pos = TOKEN.lastIndex;
  }
  return tokens;
}

function compilePluralExpression(expr: string): (n: number) => number {
  const tokens = tokenize(expr);
  let i = 0;

  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const expect = (token: string) => {
    if (next() !== token) throw new Error(`Expected "${token}" in plural expression`);
  };

  // ternary (lowest precedence, right associative)
  const parseTernary = (): Node => {
    const cond = parseOr();
    if (peek() === "?") {
      next();
      const truthy = parseTernary();
      expect(":");
      const falsy = parseTernary();
      return (n) => (cond(n) ? truthy(n) : falsy(n));
    }
    return cond;
  };

  const binary = (parseNext: () => Node, ops: Record<string, (a: number, b: number) => number>) => (): Node => {
    let left = parseNext();
    while (peek() !== undefined && ops[peek()!]) {
      const op = next()!;
      const right = parseNext();
      const fn = ops[op]!;
      const l = left;
      left = (n) => fn(l(n), right(n));
    }
    return left;
  };

  const parseOr = binary(() => parseAnd(), { "||": (a, b) => (a || b ? 1 : 0) });
  const parseAnd = binary(() => parseEquality(), { "&&": (a, b) => (a && b ? 1 : 0) });
  const parseEquality = binary(() => parseRelational(), {
    "==": (a, b) => (a === b ? 1 : 0),
    "!=": (a, b) => (a !== b ? 1 : 0),
  });
  const parseRelational = binary(() => parseAdditive(), {
    "<": (a, b) => (a < b ? 1 : 0),
    ">": (a, b) => (a > b ? 1 : 0),
    "<=": (a, b) => (a <= b ? 1 : 0),
    ">=": (a, b) => (a >= b ? 1 : 0),
  });
  const parseAdditive = binary(() => parseMultiplicative(), {
    "+": (a, b) => a + b,
    "-": (a, b) => a - b,
  });
  const parseMultiplicative = binary(() => parseUnary(), {
    "*": (a, b) => a * b,
    "/": (a, b) => Math.trunc(a / b),
    "%": (a, b) => a % b,
  });

  function parseUnary(): Node {
    if (peek() === "!") {
      next();
      const operand = parseUnary();
      return (n) => (operand(n) ? 0 : 1);
    }
    return parsePrimary();
  }

  function parsePrimary(): Node {
    const token = next();
    if (token === "(") {
      const inner = parseTernary();
      expect(")");
      return inner;
    }
    if (token === "n") return (n) => n;
    if (token !== undefined && /^\d+$/.test(token)) {
      const value = Number(token);
      return () => value;
    }
    throw new Error(`Unexpected token "${token ?? "<eof>"}" in plural expression`);
  }

  const tree = parseTernary();
  if (i !== tokens.length) {
    throw new Error("Trailing tokens in plural expression");
  }
  return (n) => Math.trunc(tree(n));
}
