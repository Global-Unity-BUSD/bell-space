/** Prompt without echoing what is typed or pasted (passwords). */
export function hidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) throw new Error('Run this in a terminal (it needs a hidden prompt), or set BELL_PASSWORD.');
  return new Promise((resolve) => {
    let value = '';
    const finish = () => {
      stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData);
      stdout.write('\n');
      // Drop bracketed-paste markers some terminals wrap pasted text in.
      resolve(value.replace(/\[20[01]~/g, ''));
    };
    const onData = (chunk: string) => {
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

/** A new password: from BELL_PASSWORD, or asked twice at a hidden prompt. */
export async function newPassword(min: number): Promise<string> {
  const fromEnv = process.env.BELL_PASSWORD;
  const password = fromEnv ?? await hidden(`Password (at least ${min} characters): `);
  if (password.length < min) throw new Error(`The password needs at least ${min} characters.`);
  if (!fromEnv && (await hidden('Type it again: ')) !== password) throw new Error('The passwords did not match.');
  return password;
}
