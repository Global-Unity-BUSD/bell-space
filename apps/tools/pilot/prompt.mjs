import { readFileSync } from 'node:fs';

// Shared by the pilot scripts: read .env.local, and prompt without echoing.

export function readEnv(path) {
  return Object.fromEntries(readFileSync(path, 'utf8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
}

/** Prompt without echoing what is typed or pasted. */
export function hidden(prompt) {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) throw new Error('Run this in a terminal (it needs a hidden prompt).');
  return new Promise((resolve) => {
    let value = '';
    const finish = () => {
      stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData);
      stdout.write('\n');
      // Drop bracketed-paste markers some terminals wrap pasted text in.
      resolve(value.replace(/\[20[01]~/g, ''));
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u0003') { stdin.setRawMode(false); stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    stdout.write(prompt);
    stdin.setRawMode(true); stdin.setEncoding('utf8'); stdin.resume();
    stdin.on('data', onData);
  });
}
