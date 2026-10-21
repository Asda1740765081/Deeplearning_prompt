import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = (await readdir(root))
  .filter((f) => f.endsWith('.md'))
  .concat(
    (await readdir(resolve(root, 'docs'))).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f)
  );
const broken = [];
for (const file of files) {
  const body = await readFile(resolve(root, file), 'utf8');
  for (const match of body.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:/i.test(target)) continue;
    try {
      await stat(resolve(root, dirname(file), decodeURIComponent(target)));
    } catch {
      broken.push(file + ' → ' + target);
    }
  }
}
if (broken.length) {
  console.error('Broken local documentation links:\n' + broken.join('\n'));
  process.exitCode = 1;
} else console.log('Local documentation links and screenshot files exist.');
