'use strict';

const readline = require('readline');

// Ask one line of text. Prompt is drawn on stderr (so stdout stays clean for
// scripting, matching the picker). Resolves the raw answer string, or null if
// the user cancels with Ctrl+C.
function question(query) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      rl.close();
      resolve(val);
    };
    rl.on('SIGINT', () => finish(null));
    rl.question(query, (answer) => finish(answer));
  });
}

// Yes/No prompt. Empty input falls back to `defaultValue`. Returns a boolean,
// or null if cancelled.
async function confirm(query, defaultValue = false) {
  const ans = await question(query);
  if (ans === null) return null;
  const s = ans.trim().toLowerCase();
  if (s === '') return defaultValue;
  return s === 'y' || s === 'yes';
}

module.exports = { question, confirm };
