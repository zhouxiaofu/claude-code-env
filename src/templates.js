'use strict';

const fs = require('fs');
const path = require('path');

const config = require('./config');
const { t } = require('./i18n');

const BUILTIN_PATH = path.join(__dirname, 'templates.builtin.json');

// Raised for user-facing template problems (bad JSON, missing --templates file,
// wrong shape). The command layer prints `.message` and exits non-zero.
class TemplateError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'TemplateError';
  }
}

// Default user-supplied templates, sitting next to config.json.
function userTemplatesPath() {
  return path.join(config.getConfigDir(), 'templates.json');
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw);
}

// Coerce one raw template entry into the shape the command layer relies on.
// Tolerant: drops non-string env values and malformed required items rather
// than throwing, so one bad field doesn't sink the whole file.
function normalizeTemplate(name, raw, source) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const env = {};
  if (raw.env && typeof raw.env === 'object' && !Array.isArray(raw.env)) {
    for (const [k, v] of Object.entries(raw.env)) {
      if (typeof v === 'string') env[k] = v;
    }
  }

  const required = [];
  if (Array.isArray(raw.required)) {
    for (const it of raw.required) {
      if (!it || typeof it !== 'object') continue;
      if (typeof it.name !== 'string' || it.name === '') continue;
      const item = { name: it.name, description: it.description ?? null };
      if (typeof it.default === 'string') item.default = it.default;
      required.push(item);
    }
  }

  return { name, description: raw.description ?? null, env, required, source };
}

// The ordered source list, low → high precedence. Later sources override
// earlier ones by template name.
function sources({ extraPath = null } = {}) {
  const list = [
    { label: 'builtin', file: BUILTIN_PATH, required: true },
    { label: 'user', file: userTemplatesPath(), required: false },
  ];
  if (extraPath) {
    list.push({ label: 'cli', file: path.resolve(extraPath), required: true });
  }
  return list;
}

// Load + merge all template sources into a Map(name → template). A later source
// replaces an earlier same-named entry wholesale (no deep merge — predictable).
function loadTemplates({ extraPath = null } = {}) {
  const merged = new Map();

  for (const src of sources({ extraPath })) {
    let data;
    try {
      data = readJson(src.file);
    } catch (e) {
      throw new TemplateError(t('add.fileParseFailed', { file: src.file, message: e.message }));
    }

    if (data == null) {
      // builtin is shipped with the package; a CLI-supplied path that doesn't
      // exist is a user error. The optional user file simply being absent is fine.
      if (src.label === 'cli') throw new TemplateError(t('add.fileNotFound', { file: src.file }));
      continue;
    }
    if (typeof data !== 'object' || Array.isArray(data)) {
      throw new TemplateError(t('add.fileBadShape', { file: src.file }));
    }

    for (const [name, raw] of Object.entries(data)) {
      const tpl = normalizeTemplate(name, raw, src.file);
      if (tpl) merged.set(name, tpl);
    }
  }

  return merged;
}

// Pure: assemble the final env to store, merging the user's answers (keyed by
// required-field name) over the template's fixed env. Answers win on collision.
function buildEnvFromTemplate(tpl, answers) {
  const env = { ...tpl.env };
  for (const item of tpl.required) {
    if (Object.prototype.hasOwnProperty.call(answers, item.name)) {
      env[item.name] = answers[item.name];
    }
  }
  return env;
}

module.exports = {
  BUILTIN_PATH,
  TemplateError,
  userTemplatesPath,
  normalizeTemplate,
  loadTemplates,
  buildEnvFromTemplate,
};
