'use strict';

// Expand ${VAR} placeholders inside a string using the provided env map.
// ${VAR} → env.VAR (or '' if missing)
// $${...} is treated as a literal ${...} (escape mechanism).
function expandEnvVars(value, env) {
  if (typeof value !== 'string') return value;
  return value.replace(/\$\$\{([^}]+)\}|\$\{([^}]+)\}/g, (m, literal, name) => {
    if (literal !== undefined) return '${' + literal + '}';
    const v = env[name];
    return v === undefined ? '' : v;
  });
}

module.exports = { expandEnvVars };
