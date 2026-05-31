'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { parseJson } = require('../src/util/json');

test('parses plain JSON like JSON.parse', () => {
  assert.deepStrictEqual(parseJson('{"a":1}'), { a: 1 });
});

test('tolerates a leading UTF-8 BOM that JSON.parse rejects', () => {
  const withBom = '﻿{\n  "env": { "A": "1" }\n}';
  assert.throws(() => JSON.parse(withBom)); // sanity: stock parser still fails
  assert.deepStrictEqual(parseJson(withBom), { env: { A: '1' } });
});

test('still throws on genuinely invalid JSON', () => {
  assert.throws(() => parseJson('{not json}'));
});
