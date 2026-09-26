import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createRawSnippet } from 'svelte';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const THEME = join(ROOT, 'src/lib/themes/shadcn');
const SRC_CSS = join(THEME, 'styles.css');
const DIST_CSS = join(ROOT, 'dist/themes/shadcn/styles.css');

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path) : [path];
	});
}

beforeAll(() => {
	// The components import the generated stylesheet; make sure it exists for the render tests.
	if (!existsSync(SRC_CSS)) execFileSync('node', ['scripts/build-css.mjs'], { cwd: ROOT });
}, 60_000);

describe('shadcn theme stylesheet (build output)', () => {
	const css = () => readFileSync(existsSync(DIST_CSS) ? DIST_CSS : SRC_CSS, 'utf8');

	it('is emitted into dist by the package build', () => {
		expect(existsSync(DIST_CSS), 'run `pnpm build` first').toBe(true);
	});

	it('contains prefixed utilities only', () => {
		const out = css();
		expect(out).toMatch(/\.aide\\:flex\{/);
		expect(out).not.toMatch(/(^|[}\s,])\.flex\{/);
		expect(out).not.toMatch(/(^|[}\s,])\.hidden\{/);
	});

	it("reads the host's shadcn variables with fallbacks", () => {
		const out = css();
		expect(out).toContain('var(--primary,');
		expect(out).toContain('var(--background,');
		expect(out).toContain('var(--border,');
		expect(out).toMatch(/prefers-color-scheme:\s*dark/);
		expect(out).toContain('.dark');
	});

	it('ships no preflight', () => {
		const out = css();
		// Preflight's universal reset (`*, ::after, ::before { box-sizing: border-box; … }`).
		expect(out).not.toMatch(/(^|[{}])\*,[^{}]*\{[^}]*box-sizing/);
		expect(out).not.toMatch(/html,\s*:host\s*\{/);
	});

	it('honours reduced motion', () => {
		expect(css()).toContain('prefers-reduced-motion');
	});
});

describe('shadcn theme (server render)', () => {
	it('renders the themed widget with a labelled launcher and no image', async () => {
		const { ChatWidget } = await import('../../../src/lib/themes/shadcn/index');
		const { body } = render(ChatWidget, { props: {} });
		expect(body).toContain('data-aide-theme="shadcn"');
		expect(body).toContain('data-part="launcher"');
		expect(body).toMatch(/aria-label="Open chat"/);
		expect(body).toMatch(/aria-expanded="false"/);
		expect(body).toContain('data-position="bottom-right"');
		expect(body).toMatch(/class="[^"]*aide:/);
		expect(body).not.toContain('<img');
	});

	it('renders nothing while enabled is false', async () => {
		const { ChatWidget } = await import('../../../src/lib/themes/shadcn/index');
		const { body } = render(ChatWidget, { props: { enabled: false } });
		expect(body).not.toContain('data-part');
	});

	it('uses the launcher snippet instead of the default launcher', async () => {
		const { ChatWidget } = await import('../../../src/lib/themes/shadcn/index');
		const launcher = createRawSnippet(() => ({ render: () => '<button data-custom="yes">Help</button>' }));
		const { body } = render(ChatWidget, { props: { launcher } });
		expect(body).toContain('data-custom="yes"');
		expect(body).not.toContain('data-part="launcher"');
	});

	it('inline mode renders the window as a region with transcript, composer and hidden status', async () => {
		const { ChatWidget } = await import('../../../src/lib/themes/shadcn/index');
		const { body } = render(ChatWidget, { props: { mode: 'inline', suggestions: ['What is this?'] } });
		expect(body).not.toContain('data-part="launcher"');
		expect(body).toContain('data-part="window"');
		expect(body).toContain('role="region"');
		expect(body).toMatch(/data-part="transcript"[^>]*aria-live="polite"|aria-live="polite"[^>]*data-part="transcript"/);
		expect(body).toContain('data-part="suggestion"');
		expect(body).toContain('data-part="input"');
		expect(body).toContain('data-part="send"');
		expect(body).toContain('data-part="disclosure"');
		expect(body).toMatch(/data-part="status"[^>]*class="[^"]*aide:sr-only/);
		expect(body).not.toContain('<img');
	});

	it('the root entry re-exports the shadcn theme', async () => {
		const root = await import('../../../src/lib/index');
		const theme = await import('../../../src/lib/themes/shadcn/index');
		expect(root.ChatWidget).toBe(theme.ChatWidget);
		expect(root.ChatWindow).toBe(theme.ChatWindow);
		expect(typeof root.createChat).toBe('function');
	});

	it('ui components import the local utils, never $lib', () => {
		for (const file of files(join(THEME, 'ui'))) {
			expect(readFileSync(file, 'utf8'), file).not.toContain('$lib');
		}
	});
});
