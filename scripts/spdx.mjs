// Minimal SPDX expression evaluator (D-052): OR → one allowed alternative is enough; AND → all; parentheses respected.
// "X WITH exception" is judged by X.

/** @param {string} expr */
function tokenize(expr) {
  const out = [];
  const re = /\s*(\(|\)|[^\s()]+)/g;
  let m;
  while ((m = re.exec(expr)) !== null) out.push(m[1]);
  return out;
}

/**
 * @param {string} expr SPDX license expression
 * @param {Set<string>} allowed license ids
 * @returns {boolean}
 */
export function spdxAllowed(expr, allowed) {
  const tokens = tokenize(expr.trim());
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  /** @returns {boolean} */
  function primary() {
    const t = next();
    if (t === undefined) throw new Error(`SPDX: unexpected end in "${expr}"`);
    if (t === "(") {
      const v = orExpr();
      if (next() !== ")") throw new Error(`SPDX: missing ")" in "${expr}"`);
      return v;
    }
    if (t === ")" || /^(AND|OR|WITH)$/i.test(t)) throw new Error(`SPDX: unexpected "${t}" in "${expr}"`);
    if (peek()?.toUpperCase() === "WITH") {
      next();
      next();
    }
    return allowed.has(t.replace(/\+$/, ""));
  }
  function andExpr() {
    let v = primary();
    while (peek()?.toUpperCase() === "AND") {
      next();
      const r = primary();
      v = v && r;
    }
    return v;
  }
  function orExpr() {
    let v = andExpr();
    while (peek()?.toUpperCase() === "OR") {
      next();
      const r = andExpr();
      v = v || r;
    }
    return v;
  }
  const v = orExpr();
  if (i !== tokens.length) throw new Error(`SPDX: trailing tokens in "${expr}"`);
  return v;
}
