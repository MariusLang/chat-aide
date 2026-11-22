import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { pageRobots, parseRobots } from '../../../src/site/robots';

const doc = (html: string) => parseHTML(html).document as unknown as Document;
const page = (head: string, body = '<p>Text.</p>') => doc(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`);

const ALLOWED = { noindex: false, nofollow: false };
const NOINDEX = { noindex: true, nofollow: false };
const NOFOLLOW = { noindex: false, nofollow: true };
const BOTH = { noindex: true, nofollow: true };

describe('parseRobots', () => {
	it.each([
		['noindex', NOINDEX],
		['NOINDEX', NOINDEX],
		['NoIndex', NOINDEX],
		['  noindex  ', NOINDEX],
		['nofollow', NOFOLLOW],
		['noindex, nofollow', BOTH],
		['noindex,nofollow', BOTH],
		[' NOINDEX ,\n\tNOFOLLOW ', BOTH],
		['nofollow, noindex', BOTH],
		['noindex nofollow', BOTH],
		['none', BOTH],
		['None', BOTH],
		['index, none', BOTH],
		['noarchive, noindex, nosnippet', NOINDEX],
		['noindex, max-snippet:20, max-image-preview:large', NOINDEX],
		['noindex, unavailable_after: 25 Jun 2030 15:00:00 PST', NOINDEX]
	])('%j says %j', (value, expected) => {
		expect(parseRobots(value)).toEqual(expected);
	});

	it.each([
		[''],
		[null],
		[undefined],
		['index, follow'],
		['all'],
		['noarchive'],
		['max-snippet:-1, max-image-preview:large, max-video-preview:-1'],
		['unavailable_after: Friday, 25-Jun-30 15:00:00 PST'],
		// A directive is a whole word.
		['noindexing'],
		['no-index'],
		['no index'],
		['nonee'],
		['index;noindex'],
		['"noindex"']
	])('%j allows everything', (value) => {
		expect(parseRobots(value)).toEqual(ALLOWED);
	});

	describe('a user agent in front of a directive', () => {
		it.each([['googlebot: noindex'], ['googlebot:noindex'], ['BingBot: none'], ['googlebot: nofollow, otherbot: noindex']])(
			'%j is for that robot only',
			(value) => {
				expect(parseRobots(value)).toEqual(ALLOWED);
			}
		);

		it('leaves the directives for everyone standing', () => {
			expect(parseRobots('noindex, googlebot: nofollow')).toEqual(NOINDEX);
			expect(parseRobots('googlebot: noarchive, noindex')).toEqual(NOINDEX);
		});

		it('covers only the directive it is written on, since header lines arrive joined', () => {
			// `X-Robots-Tag: googlebot: nofollow` and `X-Robots-Tag: noindex`, as one value.
			expect(parseRobots('googlebot: nofollow, noindex')).toEqual(NOINDEX);
			expect(parseRobots('googlebot: noindex, nofollow')).toEqual(NOFOLLOW);
		});
	});
});

describe('pageRobots', () => {
	it('reads the robots meta tag', () => {
		expect(pageRobots(page('<meta name="robots" content="noindex">'))).toEqual(NOINDEX);
		expect(pageRobots(page('<meta name="robots" content="noindex, nofollow">'))).toEqual(BOTH);
		expect(pageRobots(page('<meta name="robots" content="none">'))).toEqual(BOTH);
		expect(pageRobots(page('<meta name="robots" content="index, follow">'))).toEqual(ALLOWED);
		expect(pageRobots(page('<title>No tag</title>'))).toEqual(ALLOWED);
	});

	it.each([
		['<meta name="ROBOTS" content="NOINDEX">'],
		['<meta name="Robots" content="NoIndex">'],
		['<META NAME="ROBOTS" CONTENT="NOINDEX">'],
		['<meta Name="robots" Content="noindex">'],
		["<meta name='robots' content='noindex'>"],
		['<meta name=robots content=noindex>'],
		['<meta content="noindex" name="robots"/>'],
		['<meta name=" robots " content="  noindex  ">'],
		['<meta name="robots" content="no&#105;ndex">']
	])('matches %s', (tag) => {
		expect(pageRobots(page(tag))).toEqual(NOINDEX);
	});

	it('any of several robots tags can say noindex', () => {
		const head =
			'<meta name="robots" content="index, follow"><meta name="description" content="noindex">' +
			'<meta name="robots" content="max-snippet:20"><meta name="robots" content="noindex">';
		expect(pageRobots(page(head))).toEqual(NOINDEX);
		const split = '<meta name="robots" content="nofollow"><meta name="robots" content="noindex">';
		expect(pageRobots(page(split))).toEqual(BOTH);
	});

	it('skips tags named after one crawler', () => {
		const head =
			'<meta name="googlebot" content="noindex"><meta name="bingbot" content="none">' +
			'<meta name="googlebot-news" content="noindex"><meta name="robots-extra" content="noindex">';
		expect(pageRobots(page(head))).toEqual(ALLOWED);
	});

	it('skips other meta tags that hold the word', () => {
		const head =
			'<meta name="description" content="How to noindex a page"><meta name="keywords" content="noindex, nofollow">' +
			'<meta property="robots" content="noindex"><meta http-equiv="robots" content="noindex">' +
			'<meta name="robots"><meta content="noindex">';
		expect(pageRobots(page(head))).toEqual(ALLOWED);
	});

	it('does not match the word in text, comments, scripts or code samples', () => {
		const head =
			'<title>noindex, nofollow</title><!-- <meta name="robots" content="noindex"> -->' +
			'<script>const tag = \'<meta name="robots" content="noindex">\';</script>' +
			'<style>/* <meta name="robots" content="noindex"> */</style>';
		const body =
			'<p>Add &lt;meta name="robots" content="noindex"&gt; to hide a page. noindex, nofollow, none.</p>' +
			'<pre><code>&lt;meta name="robots" content="noindex"&gt;</code></pre>' +
			'<textarea><meta name="robots" content="noindex"></textarea>' +
			'<template><meta name="robots" content="noindex"></template>' +
			'<a href="/noindex" rel="nofollow">noindex</a><div data-robots="noindex" class="noindex">none</div>';
		expect(pageRobots(page(head, body))).toEqual(ALLOWED);
	});

	it('counts a robots tag outside the head, and inside noscript', () => {
		expect(pageRobots(page('', '<p>Text.</p><meta name="robots" content="noindex">'))).toEqual(NOINDEX);
		expect(pageRobots(page('<noscript><meta name="robots" content="noindex"></noscript>'))).toEqual(NOINDEX);
		expect(pageRobots(doc('<meta name="robots" content="noindex"><p>No html element.</p>'))).toEqual(NOINDEX);
	});

	it('reads the X-Robots-Tag header', () => {
		const plain = page('<title>Plain</title>');
		expect(pageRobots(plain, 'noindex')).toEqual(NOINDEX);
		expect(pageRobots(plain, 'NoIndex, NoFollow')).toEqual(BOTH);
		expect(pageRobots(plain, 'none')).toEqual(BOTH);
		expect(pageRobots(plain, 'noarchive, max-snippet: 10')).toEqual(ALLOWED);
		expect(pageRobots(plain, 'googlebot: noindex')).toEqual(ALLOWED);
		expect(pageRobots(plain, null)).toEqual(ALLOWED);
		expect(pageRobots(plain)).toEqual(ALLOWED);
	});

	it('merges header and tags: either can say noindex', () => {
		expect(pageRobots(page('<meta name="robots" content="index">'), 'noindex')).toEqual(NOINDEX);
		expect(pageRobots(page('<meta name="robots" content="noindex">'), 'index, follow')).toEqual(NOINDEX);
		expect(pageRobots(page('<meta name="robots" content="nofollow">'), 'noindex')).toEqual(BOTH);
	});
});
