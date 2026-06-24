'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { evalExpr, render } = require('../src/util/expr');

test('name expression: optional segment drops cleanly', () => {
  const T = "kimi-${plan}${ model ? '-' + model : '' }";
  assert.equal(render(T, { plan: 'api', model: 'k2.6' }), 'kimi-api-k2.6');
  assert.equal(render(T, { plan: 'sub' }), 'kimi-sub');
});

test('equality and ternary', () => {
  assert.equal(render("${ plan == 'api' ? 'pay' : 'sub' }", { plan: 'api' }), 'pay');
  assert.equal(render("${ plan == 'api' ? 'pay' : 'sub' }", { plan: 'x' }), 'sub');
  assert.equal(evalExpr("a != 'b'", { a: 'c' }), 'true');
  assert.equal(evalExpr("a != 'b'", { a: 'b' }), '');
});

test('not + truthiness + parens', () => {
  assert.equal(evalExpr("!model ? 'none' : model", { }), 'none');
  assert.equal(evalExpr("!model ? 'none' : model", { model: 'x' }), 'x');
  assert.equal(evalExpr("( a + b )", { a: '1', b: '2' }), '12');
});

test('$$ escapes a literal dollar', () => {
  assert.equal(render('a$$b', {}), 'a$b');
  assert.equal(render('$${x}', { x: 'v' }), '${x}'); // $$ then {x} literal — no expr
});

test('strict mode throws on undefined variable (env values)', () => {
  assert.throws(() => render('${missing}', {}, { strict: true }), /undefined variable: missing/);
});

test('lenient mode yields empty for undefined (name expressions)', () => {
  assert.equal(render('${missing}', {}), '');
});

test('prototype pollution: __proto__/constructor read as empty', () => {
  assert.equal(render('${__proto__}', {}), '');
  assert.equal(render('${constructor}', {}), '');
  assert.equal(render('${hasOwnProperty}', {}), '');
});

test('rejects oversized expression source', () => {
  const big = 'a'.repeat(600);
  assert.throws(() => evalExpr(big, {}), /bad expr/);
});

test('rejects malformed input', () => {
  assert.throws(() => evalExpr("'unterminated", {}), /unterminated string/);
  assert.throws(() => render('${ a +', {}), /unterminated \$\{|unexpected token/);
  assert.throws(() => evalExpr('a b', {}), /trailing tokens/);
});

test('non-string template renders to empty', () => {
  assert.equal(render(null, {}), '');
  assert.equal(render(undefined, {}), '');
});
