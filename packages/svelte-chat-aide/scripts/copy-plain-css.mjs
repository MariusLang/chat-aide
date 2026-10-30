// Copies the plain theme's stylesheet from @chat-aide/core into src/lib so svelte-package ships
// it at svelte-chat-aide/themes/plain/plain.css. The components import it from core directly;
// this copy exists only for hosts that link the file themselves. The copy is git-ignored.
import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
copyFileSync(require.resolve('@chat-aide/core/plain.css'), join(root, 'src/lib/themes/plain/plain.css'));
