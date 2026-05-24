'use strict';

const SECRET_KEY_PATTERNS = [
  /TOKEN/i,
  /KEY/i,
  /SECRET/i,
  /PASSWORD/i,
  /AUTH/i,
];

function isSecretKey(name) {
  return SECRET_KEY_PATTERNS.some((re) => re.test(name));
}

function maskValue(value) {
  if (typeof value !== 'string') return value;
  if (value.length <= 8) return '***';
  return value.slice(0, 4) + '***' + value.slice(-4);
}

function maskEnvObject(envObj) {
  const out = {};
  for (const [k, v] of Object.entries(envObj || {})) {
    out[k] = isSecretKey(k) ? maskValue(v) : v;
  }
  return out;
}

module.exports = { isSecretKey, maskValue, maskEnvObject };
