<script lang="ts">
	import { ScrollArea as ScrollAreaPrimitive } from "bits-ui";
	import { cn, type WithoutChild } from "../../utils.js";

	let {
		ref = $bindable(null),
		class: className,
		orientation = "vertical",
		children,
		...restProps
	}: WithoutChild<ScrollAreaPrimitive.ScrollbarProps> = $props();
</script>

<ScrollAreaPrimitive.Scrollbar
	bind:ref
	data-slot="scroll-area-scrollbar"
	data-orientation={orientation}
	{orientation}
	class={cn(
		"aide:data-horizontal:h-2.5 aide:data-horizontal:flex-col aide:data-horizontal:border-t aide:data-horizontal:border-t-transparent aide:data-vertical:h-full aide:data-vertical:w-2.5 aide:data-vertical:border-l aide:data-vertical:border-l-transparent aide:flex aide:touch-none aide:p-px aide:transition-colors aide:select-none",
		className
	)}
	{...restProps}
>
	{@render children?.()}
	<ScrollAreaPrimitive.Thumb
		data-slot="scroll-area-thumb"
		class="aide:rounded-full aide:relative aide:flex-1 aide:bg-border"
	/>
</ScrollAreaPrimitive.Scrollbar>
