'use strict';

// Safe expression evaluator for template `name` expressions and `${...}` env
// interpolation. Tiny fixed grammar: ident | 'str' | + | ?: | == != ! | ( ).
// Output is always a string. NEVER uses eval/Function. Reads only own
// properties of `vars` (guards against __proto__/constructor injection), so a
// hostile remote template can do nothing but concatenate/compare strings.

const MAX_EXPR_LEN = 512;

function tokenize(src) {
  const toks = [];
  let i = 0;
  const isIdStart = (c) => /[A-Za-z_]/.test(c);
  const isId = (c) => /[A-Za-z0-9_]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if (c === "'") {
      let j = i + 1, s = '';
      while (j < src.length && src[j] !== "'") { s += src[j]; j++; }
      if (j >= src.length) throw new Error('unterminated string');
      toks.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if (isIdStart(c)) {
      let j = i, s = '';
      while (j < src.length && isId(src[j])) { s += src[j]; j++; }
      toks.push({ t: 'id', v: s }); i = j; continue;
    }
    if (c === '=' && src[i + 1] === '=') { toks.push({ t: 'op', v: '==' }); i += 2; continue; }
    if (c === '!' && src[i + 1] === '=') { toks.push({ t: 'op', v: '!=' }); i += 2; continue; }
    if ('+?:!()'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new Error('unexpected char: ' + c);
  }
  toks.push({ t: 'eof' });
  return toks;
}

// Evaluate one expression string against `vars`. strict=true throws on an
// undefined identifier (used for env values); strict=false yields '' (used for
// name expressions, so `model ? '-'+model : ''` degrades cleanly).
function evalExpr(src, vars, { strict = false } = {}) {
  if (typeof src !== 'string' || src.length > MAX_EXPR_LEN) throw new Error('bad expr');
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expect = (v) => { const tk = next(); if (tk.v !== v) throw new Error('expected ' + v); };
  const truthy = (x) => (typeof x === 'boolean' ? x : typeof x === 'string' && x.length > 0);
  const toStr = (x) => (typeof x === 'boolean' ? (x ? 'true' : '') : x == null ? '' : String(x));

  function ternary() {
    const cond = equality();
    if (peek().v === '?') { next(); const a = ternary(); expect(':'); const b = ternary(); return truthy(cond) ? a : b; }
    return cond;
  }
  function equality() {
    let l = add();
    while (peek().v === '==' || peek().v === '!=') {
      const op = next().v;
      const r = add();
      const eq = toStr(l) === toStr(r);
      l = op === '==' ? eq : !eq;
    }
    return l;
  }
  function add() {
    let l = unary();
    while (peek().v === '+') { next(); l = toStr(l) + toStr(unary()); }
    return l;
  }
  function unary() {
    if (peek().v === '!') { next(); return !truthy(unary()); }
    return primary();
  }
  function primary() {
    const tk = peek();
    if (tk.v === '(') { next(); const e = ternary(); expect(')'); return e; }
    if (tk.t === 'str') { next(); return tk.v; }
    if (tk.t === 'id') {
      next();
      if (Object.prototype.hasOwnProperty.call(vars, tk.v)) return String(vars[tk.v]);
      if (strict) throw new Error('undefined variable: ' + tk.v);
      return '';
    }
    throw new Error('unexpected token');
  }

  const r = ternary();
  if (peek().t !== 'eof') throw new Error('trailing tokens');
  return toStr(r);
}

// Render a template string: literal text + ${expr}. `$$` escapes a literal `$`.
function render(tpl, vars, opts) {
  if (typeof tpl !== 'string') return '';
  let out = '', i = 0;
  while (i < tpl.length) {
    if (tpl[i] === '$' && tpl[i + 1] === '$') { out += '$'; i += 2; continue; }
    if (tpl[i] === '$' && tpl[i + 1] === '{') {
      let j = i + 2, inStr = false;
      for (; j < tpl.length; j++) {
        const ch = tpl[j];
        if (inStr) { if (ch === "'") inStr = false; }
        else if (ch === "'") inStr = true;
        else if (ch === '}') break;
      }
      if (j >= tpl.length) throw new Error('unterminated ${');
      out += evalExpr(tpl.slice(i + 2, j), vars, opts);
      i = j + 1;
      continue;
    }
    out += tpl[i];
    i++;
  }
  return out;
}

module.exports = { evalExpr, render };
