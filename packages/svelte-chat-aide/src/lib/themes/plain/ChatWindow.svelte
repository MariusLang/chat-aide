<!--
  Plain theme ChatWindow (spec §3.8, §3.9 layer 2): the headless window mounted alone — by
  default as an inline docs column — inside a `data-aide-theme="plain"` root. For `floating` and
  `sheet` it shows while `chat.isOpen`, as a modal dialog placed by `position` and `offset`.
-->
<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import HeadlessChatWindow from '../../headless/ChatWindow.svelte';
	import type { WidgetMode, WidgetPosition } from '../../headless/create-chat.svelte.js';
	import css from './plain.css?raw';

	type HeadlessProps = ComponentProps<typeof HeadlessChatWindow>;

	let {
		chat,
		mode = 'inline',
		position = 'bottom-right',
		offset,
		modal,
		nonce,
		theme,
		stylesheet = true,
		...rest
	}: HeadlessProps & {
		/** `inline` (default) renders in the page flow; `floating` and `sheet` overlay it while open. */
		mode?: WidgetMode;
		position?: WidgetPosition;
		offset?: { x?: number | string; y?: number | string };
		/** CSP nonce for the injected `<style>` (spec §3.6). */
		nonce?: string;
		/** Pins light or dark; by default the theme follows `prefers-color-scheme` or an ancestor's `data-theme`. */
		theme?: 'light' | 'dark';
		/** `false` injects no `<style>`: the host links `svelte-chat-aide/themes/plain/plain.css` itself. */
		stylesheet?: boolean;
	} = $props();

	const inline = $derived(mode === 'inline');
	const fmt = (v: number | string | undefined): string | undefined =>
		v === undefined ? undefined : typeof v === 'number' ? `${v}px` : v;
</script>

<svelte:head>
	{#if stylesheet}
		<svelte:element this={'style'} {nonce} data-aide-style="plain">{css}</svelte:element>
	{/if}
</svelte:head>

<div data-aide-ignore data-aide-theme="plain" data-theme={theme}>
	<div
		data-part="widget"
		data-mode={mode}
		data-position={inline ? undefined : position}
		data-open={chat.isOpen ? '' : undefined}
		style:--aide-offset-x={fmt(offset?.x)}
		style:--aide-offset-y={fmt(offset?.y)}
	>
		{#if inline || chat.isOpen}
			<HeadlessChatWindow {chat} modal={modal ?? !inline} {...rest} />
		{/if}
	</div>
</div>
