'use strict';

const readline = require('readline');
const pc = require('picocolors');

// Key sequences. Arrow keys arrive as multi-byte escape sequences.
const KEY = {
  UP:    '[A',
  DOWN:  '[B',
  ENTER: '\r',
  LF:    '\n',
  ESC:   '',
  CTRL_C:'',
  K:     'k',
  J:     'j',
  Q:     'q',
};

/**
 * Interactive list picker. Returns the chosen item or null on cancel.
 *
 * @param {object} opts
 * @param {Array<{value: string, label: string, hint?: string, marker?: string}>} opts.items
 * @param {string}   [opts.title]         Header line shown above the list
 * @param {string}   [opts.initialValue]  value to highlight on open
 * @returns {Promise<string|null>}        chosen value, or null if cancelled
 */
function pick({ items, title = 'Pick an item:', initialValue = null }) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      // No TTY — bail. Caller is expected to handle this.
      resolve(null);
      return;
    }
    if (!items || items.length === 0) {
      resolve(null);
      return;
    }

    const out = process.stderr; // draw on stderr so stdout stays clean for scripting
    let cursor = Math.max(0, items.findIndex((it) => it.value === initialValue));
    if (cursor < 0) cursor = 0;
    let drawnLines = 0;

    const nameWidth = Math.max(...items.map((it) => it.label.length));

    function render() {
      // Erase previous frame.
      if (drawnLines > 0) {
        readline.moveCursor(out, 0, -drawnLines);
        readline.clearScreenDown(out);
      }

      const lines = [];
      lines.push(pc.bold(title));
      lines.push('');
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const isCursor = i === cursor;
        const arrow = isCursor ? pc.cyan('❯ ') : '  ';
        const marker = it.marker ? pc.green(it.marker) : ' ';
        const label = isCursor ? pc.cyan(it.label.padEnd(nameWidth)) : it.label.padEnd(nameWidth);
        const hint = it.hint ? pc.dim(it.hint) : '';
        lines.push(`${arrow}${marker} ${label}  ${hint}`);
      }
      lines.push('');
      lines.push(pc.dim('  ↑/↓ navigate · Enter select · Esc/Ctrl+C cancel'));

      const frame = lines.join('\n');
      out.write(frame + '\n');
      drawnLines = lines.length;
    }

    function eraseFrame() {
      if (drawnLines > 0) {
        readline.moveCursor(out, 0, -drawnLines);
        readline.clearScreenDown(out);
        drawnLines = 0;
      }
    }

    let cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      process.stdin.removeListener('data', onData);
      try { process.stdin.setRawMode(false); } catch { /* ignore */ }
      process.stdin.pause();
      out.write('[?25h'); // show cursor
    }

    function finish(value) {
      eraseFrame();
      cleanup();
      resolve(value);
    }

    function onData(chunk) {
      const s = chunk.toString('utf8');

      // Handle Ctrl+C as cancel (raw mode bypasses default SIGINT).
      if (s === KEY.CTRL_C) {
        finish(null);
        return;
      }
      if (s === KEY.ESC || s === KEY.Q) {
        finish(null);
        return;
      }
      if (s === KEY.ENTER || s === KEY.LF) {
        finish(items[cursor].value);
        return;
      }
      if (s === KEY.UP || s === KEY.K) {
        cursor = (cursor - 1 + items.length) % items.length;
        render();
        return;
      }
      if (s === KEY.DOWN || s === KEY.J) {
        cursor = (cursor + 1) % items.length;
        render();
        return;
      }
      // Number keys 1..9 to jump
      if (/^[1-9]$/.test(s)) {
        const idx = parseInt(s, 10) - 1;
        if (idx < items.length) {
          cursor = idx;
          render();
        }
        return;
      }
      // Ignore other keys.
    }

    // Hide cursor + enter raw mode.
    out.write('[?25l');
    try {
      process.stdin.setRawMode(true);
    } catch (e) {
      // Some environments (e.g. CI, npm scripts) don't support raw mode.
      out.write('[?25h');
      resolve(null);
      return;
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);

    // Restore on unexpected exits.
    process.once('exit', cleanup);

    render();
  });
}

module.exports = { pick };
