'use strict';

const pc = require('picocolors');

const QUIET = process.env.CCE_QUIET === '1';

function info(msg) {
  if (QUIET) return;
  process.stderr.write(pc.cyan('[cce] ') + msg + '\n');
}

function warn(msg) {
  process.stderr.write(pc.yellow('[cce] ') + msg + '\n');
}

function error(msg) {
  process.stderr.write(pc.red('[cce] ') + msg + '\n');
}

function success(msg) {
  if (QUIET) return;
  process.stderr.write(pc.green('[cce] ') + msg + '\n');
}

function plain(msg) {
  process.stdout.write(msg + '\n');
}

module.exports = { info, warn, error, success, plain, colors: pc };
