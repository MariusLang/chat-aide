import { describe, it, expect } from 'vitest';
import {
	IN_PROCESS_ORIGIN,
	DEFAULT_EXCLUDES,
	SIDE_EFFECT_SEGMENTS,
	normalizeRoute,
	matchesPattern,
	isExcluded,
	acceptRoute,
	acceptHref
} from '../../../src/lib/site/route';

const opts = { exclude: [] as string[] };
const site = { origin: 'https://site.dev', base: 'https://site.dev/', exclude: [] as string[] };

describe('route rule', () => {
	// acceptance #7
	it.each([
		'//evil.example/x',
		'//169.254.169.254/latest/meta-data/',
		'/\\evil.example',
		'/a/../api/x',
		'/%2e%2e/api/x',
		'/%2E%2E/api/x',
		'/%2F%2Fevil.example',
		'/a%5cb',
		'http://evil.example/',
		'',
		'x',
		'/' + 'a'.repeat(512),
		'/a\u0000b',
		'/a\tb',
		'/a\u007fb',
		'/logout',
		'/account/sign-out',
		'/newsletter/unsubscribe/',
		'/files/report.pdf',
		'/api/chat',
		'/api'
	])('refuses %j', (input) => {
		expect(acceptRoute(input, opts)).toBeNull();
		expect(acceptRoute(input, { origin: 'https://site.dev', exclude: [] })).toBeNull();
	});

	it.each([123, null, undefined, {}, ['/'], new String('/')])('refuses non-string %j', (input) => {
		expect(normalizeRoute(input)).toBeNull();
		expect(acceptRoute(input, opts)).toBeNull();
	});

	it('refuses foreign-host shapes in normalizeRoute itself', () => {
		for (const r of ['//evil.example/x', '/\\evil.example', '/%2F%2Fevil.example', 'http://evil.example/', '/' + 'a'.repeat(512)])
			expect(normalizeRoute(r)).toBeNull();
	});

	it('normalizes dot segments before excludes', () => {
		expect(normalizeRoute('/a/../api/x')).toBe('/api/x');
		expect(isExcluded('/api/x', [])).toBe(true);
	});

	it.each([
		['/', '/'],
		['/docs/intro?x=1#h', '/docs/intro'],
		['/docs/./a', '/docs/a'],
		['/a/b/../c', '/a/c'],
		['/' + 'a'.repeat(511), '/' + 'a'.repeat(511)]
	])('accepts %j as %j', (input, out) => {
		expect(acceptRoute(input, opts)).toBe(out);
		expect(acceptRoute(input, { origin: 'https://site.dev', exclude: [] })).toBe(out);
	});

	it('refuses when the configured origin is malformed, never throws', () => {
		expect(normalizeRoute('/', 'not a url')).toBeNull();
		expect(normalizeRoute('/', 'https://site.dev/')).toBe('/');
	});
});

describe('excludes', () => {
	it('default excludes cover /api/** and side-effect segments', () => {
		expect(DEFAULT_EXCLUDES).toContain('/api/**');
		expect(SIDE_EFFECT_SEGMENTS).toEqual(['logout', 'logoff', 'signout', 'sign-out', 'unsubscribe', 'delete', 'remove']);
		for (const s of SIDE_EFFECT_SEGMENTS) {
			expect(isExcluded(`/${s}`, [])).toBe(true);
			expect(isExcluded(`/a/b/${s}`, [])).toBe(true);
		}
		expect(isExcluded('/logout-help', [])).toBe(false);
		expect(isExcluded('/remove/x', [])).toBe(false);
	});

	it('extension rule: dot plus 1-8 alnum in the last segment', () => {
		expect(isExcluded('/files/report.pdf', [])).toBe(true);
		expect(isExcluded('/feed.xml', [])).toBe(true);
		expect(isExcluded('/docs/intro.md', [])).toBe(true);
		expect(isExcluded('/v1.2/docs', [])).toBe(false);
		expect(isExcluded('/a.verylongext', [])).toBe(false);
		expect(isExcluded('/docs/intro', [])).toBe(false);
	});

	it('user exclude /private/** refuses nested paths', () => {
		const o = { exclude: ['/private/**'] };
		expect(acceptRoute('/private/a/b', o)).toBeNull();
		expect(acceptRoute('/private', o)).toBeNull();
		expect(acceptRoute('/privately', o)).toBe('/privately');
	});

	it('* matches exactly one segment', () => {
		expect(matchesPattern('/blog/a', '/blog/*')).toBe(true);
		expect(matchesPattern('/blog/a/b', '/blog/*')).toBe(false);
		expect(matchesPattern('/blog', '/blog/*')).toBe(false);
		expect(matchesPattern('/x/drafts/y', '/*/drafts/*')).toBe(true);
		expect(matchesPattern('/a/b/c', '/**/c')).toBe(true);
		expect(matchesPattern('/c', '/**/c')).toBe(true);
		expect(matchesPattern('/about', '/about')).toBe(true);
		expect(matchesPattern('/about/team', '/about')).toBe(false);
	});
});

describe('acceptHref', () => {
	it('accepts same-origin absolute hrefs as their pathname', () => {
		expect(acceptHref('https://site.dev/p?q', site)).toBe('/p');
		expect(acceptHref('https://site.dev/p#frag', site)).toBe('/p');
		expect(acceptHref('/docs/../p', site)).toBe('/p');
	});

	it('refuses foreign, excluded and unparsable hrefs', () => {
		expect(acceptHref('https://other.dev/p', site)).toBeNull();
		expect(acceptHref('http://site.dev/p', site)).toBeNull();
		expect(acceptHref('//evil.example/x', site)).toBeNull();
		expect(acceptHref('/\\evil.example', site)).toBeNull();
		expect(acceptHref('https://site.dev/logout', site)).toBeNull();
		expect(acceptHref('https://site.dev/a.pdf', site)).toBeNull();
		expect(acceptHref('https://site.dev/%2e%2e/api', site)).toBeNull();
		expect(acceptHref('mailto:x@site.dev', site)).toBeNull();
		expect(acceptHref('http://[bad', site)).toBeNull();
		expect(acceptHref('/p', { ...site, exclude: ['/p'] })).toBeNull();
	});

	it('resolves relative hrefs against IN_PROCESS_ORIGIN when no origin is configured', () => {
		expect(acceptHref('/p', { base: IN_PROCESS_ORIGIN, exclude: [] })).toBe('/p');
		expect(acceptHref('q', { base: `${IN_PROCESS_ORIGIN}/docs/`, exclude: [] })).toBe('/docs/q');
		expect(acceptHref('https://site.dev/p', { base: IN_PROCESS_ORIGIN, exclude: [] })).toBeNull();
	});
});
