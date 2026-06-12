'use strict';

const { spawn } = require('child_process');

// Open a URL in the system default browser. Resolves true when the opener
// launched cleanly, false otherwise (missing binary, non-zero exit). Callers
// must validate the URL (http/https only) before calling — the string is
// handed straight to the OS.
//
// Windows uses rundll32 rather than `cmd /c start` because cmd re-parses its
// argument string, so metacharacters like & in a URL would break it.
function openUrl(url) {
  let cmd;
  let args;
  if (process.platform === 'win32') {
    cmd = 'rundll32';
    args = ['url.dll,FileProtocolHandler', url];
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    } catch {
      resolve(false);
      return;
    }
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
    child.unref();
  });
}

module.exports = { openUrl };
