<script lang="ts">
	import { Dialog as SheetPrimitive } from "bits-ui";
	import { cn } from "../../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SheetPrimitive.OverlayProps = $props();
</script>

<SheetPrimitive.Overlay
	bind:ref
	data-slot="sheet-overlay"
	class={cn(
		"aide:bg-black/10 aide:supports-backdrop-filter:backdrop-blur-xs aide:fixed aide:inset-0 aide:z-50 aide:duration-100 aide:data-open:animate-in aide:data-open:fade-in-0 aide:data-closed:animate-out aide:data-closed:fade-out-0",
		className
	)}
	{...restProps}
/>
