<!--
  An icon from pixelarticons (github.com/halfmage/pixelarticons), MIT License,
  Copyright (c) 2019 Gerrit Halfmann. Only the icons listed here are bundled.
-->
<script lang="ts" module>
	import arrowLeft from 'pixelarticons/svg/arrow-left.svg?raw';
	import arrowRight from 'pixelarticons/svg/arrow-right.svg?raw';
	import check from 'pixelarticons/svg/check.svg?raw';
	import close from 'pixelarticons/svg/close.svg?raw';
	import copy from 'pixelarticons/svg/copy.svg?raw';
	import github from 'pixelarticons/svg/github.svg?raw';
	import menu from 'pixelarticons/svg/menu.svg?raw';
	import message from 'pixelarticons/svg/message-text.svg?raw';
	import moon from 'pixelarticons/svg/moon.svg?raw';
	import sun from 'pixelarticons/svg/sun.svg?raw';

	const ICONS = { arrowLeft, arrowRight, check, close, copy, github, menu, message, moon, sun };
	export type IconName = keyof typeof ICONS;

	/** The icon's inner markup (its paths), without the <svg> wrapper. */
	const inner = (svg: string) => svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
	const BODY = Object.fromEntries(Object.entries(ICONS).map(([k, v]) => [k, inner(v)])) as Record<IconName, string>;
</script>

<script lang="ts">
	let { name, class: className = 'size-4' }: { name: IconName; class?: string } = $props();
</script>

<svg viewBox="0 0 24 24" fill="currentColor" shape-rendering="crispEdges" class={className} aria-hidden="true">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- bundled icon markup -->
	{@html BODY[name]}
</svg>
