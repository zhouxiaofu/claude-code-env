'use strict';

// Parse JSON the way Claude Code's own settings loader does: tolerate a leading
// UTF-8 BOM (U+FEFF). Editors on Windows (Notepad, some PowerShell redirects)
// prepend a BOM, which Node's fs.readFileSync(..., 'utf8') keeps verbatim and
// the built-in JSON.parse then rejects with "Unexpected token '﻿'".
// Stripping it makes us match Claude, which reads the same file without error.
function parseJson(text) {
  if (typeof text === 'string' && text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return JSON.parse(text);
}

module.exports = { parseJson };
