'use strict';

const fs = require('fs');
const crossSpawn = require('cross-spawn');

const config = require('../config');
const log = require('../util/log');
const { t } = require('../i18n');

function pickEditor() {
  if (process.env.VISUAL) return process.env.VISUAL;
  if (process.env.EDITOR) return process.env.EDITOR;
  return process.platform === 'win32' ? 'notepad' : 'vi';
}

function run() {
  const file = config.getConfigPath();
  // Make sure the file exists so the editor opens a real path with content.
  if (!fs.existsSync(file)) {
    config.save(config.defaultConfig());
  }

  const editor = pickEditor();
  log.info(t('edit.opening', { file, editor }));

  const result = crossSpawn.sync(editor, [file], { stdio: 'inherit' });
  if (result.error) {
    log.error(t('edit.launchFailed', { editor, message: result.error.message }));
    return 1;
  }
  // Validate the post-edit JSON.
  try {
    config.load();
    log.success(t('edit.saved'));
    return 0;
  } catch (e) {
    log.error(e.message);
    return 1;
  }
}

module.exports = { run };
