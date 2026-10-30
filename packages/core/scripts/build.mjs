// Compiles src/ to dist/ with tsc, then copies the files tsc does not emit: the browser guard
// (resolved under the `browser` export condition) and the plain theme's stylesheet.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const require = createRequire(import.meta.url);
const tsc = join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');

rmSync(dist, { recursive: true, force: true });
execFileSync(process.execPath, [tsc, '-p', join(root, 'tsconfig.build.json')], { cwd: root, stdio: 'inherit' });
cpSync(join(root, 'src/server/browser-guard.js'), join(dist, 'server/browser-guard.js'));
mkdirSync(join(dist, 'themes'), { recursive: true });
cpSync(join(root, 'src/themes/plain.css'), join(dist, 'themes/plain.css'));
