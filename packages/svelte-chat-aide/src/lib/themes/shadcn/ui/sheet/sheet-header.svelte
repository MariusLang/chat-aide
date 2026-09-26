<script lang="ts">
	import { cn, type WithElementRef } from "../../utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="sheet-header"
	class={cn("aide:gap-1.5 aide:p-4 aide:flex aide:flex-col", className)}
	{...restProps}
>
	{@render children?.()}
</div>
