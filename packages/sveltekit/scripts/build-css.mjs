// Compiles src/lib/themes/shadcn/styles.src.css -> styles.css with Tailwind 4 (spec §3.9 layer 3).
// Runs before svelte-package, which copies the result into dist/. The output is git-ignored.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const theme = join(root, 'src/lib/themes/shadcn');
const require = createRequire(import.meta.url);
const cliPkg = require.resolve('@tailwindcss/cli/package.json');
const cli = join(dirname(cliPkg), require(cliPkg).bin.tailwindcss);

execFileSync(
	process.execPath,
	[cli, '-i', join(theme, 'styles.src.css'), '-o', join(theme, 'styles.css'), '--minify'],
	{ cwd: root, stdio: 'inherit' }
);
