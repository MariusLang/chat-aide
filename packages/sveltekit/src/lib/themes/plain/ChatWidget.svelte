<!--
  Plain theme ChatWidget (spec §3.9 layer 2): the headless widget inside a
  `data-aide-theme="plain"` root, plus the theme's stylesheet in a single `<style>` in the
  document head. Every headless prop passes through unchanged.
-->
<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import HeadlessChatWidget from '../../headless/ChatWidget.svelte';
	import css from '@chat-aide/core/plain.css?raw';

	type HeadlessProps = ComponentProps<typeof HeadlessChatWidget>;

	let {
		open = $bindable(false),
		nonce,
		theme,
		stylesheet = true,
		...rest
	}: HeadlessProps & {
		/** CSP nonce for the injected `<style>` (spec §3.6). */
		nonce?: string;
		/** Pins light or dark; by default the theme follows `prefers-color-scheme` or an ancestor's `data-theme`. */
		theme?: 'light' | 'dark';
		/** `false` injects no `<style>`: the host links `@chat-aide/sveltekit/themes/plain/plain.css` itself. */
		stylesheet?: boolean;
	} = $props();
</script>

<svelte:head>
	{#if stylesheet}
		<svelte:element this={'style'} {nonce} data-aide-style="plain">{css}</svelte:element>
	{/if}
</svelte:head>

<div data-aide-ignore data-aide-theme="plain" data-theme={theme}>
	<HeadlessChatWidget bind:open {...rest} />
</div>
