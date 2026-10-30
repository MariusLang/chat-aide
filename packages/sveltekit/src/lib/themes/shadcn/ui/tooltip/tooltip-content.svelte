<script lang="ts">
	import { Tooltip as TooltipPrimitive } from "bits-ui";
	import { cn } from "../../utils.js";
	import type { WithoutChildrenOrChild } from "../../utils.js";
	import TooltipPortal from "./tooltip-portal.svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 0,
		side = "top",
		children,
		arrowClasses,
		portalProps,
		...restProps
	}: TooltipPrimitive.ContentProps & {
		arrowClasses?: string;
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof TooltipPortal>>;
	} = $props();
</script>

<TooltipPortal {...portalProps}>
	<TooltipPrimitive.Content
		bind:ref
		data-slot="tooltip-content"
		{sideOffset}
		{side}
		class={cn(
			"aide:data-open:animate-in aide:data-open:fade-in-0 aide:data-open:zoom-in-95 aide:data-[state=delayed-open]:animate-in aide:data-[state=delayed-open]:fade-in-0 aide:data-[state=delayed-open]:zoom-in-95 aide:data-closed:animate-out aide:data-closed:fade-out-0 aide:data-closed:zoom-out-95 aide:data-[side=bottom]:slide-in-from-top-2 aide:data-[side=left]:slide-in-from-right-2 aide:data-[side=right]:slide-in-from-left-2 aide:data-[side=top]:slide-in-from-bottom-2 aide:inline-flex aide:items-center aide:gap-1.5 aide:rounded-md aide:px-3 aide:py-1.5 aide:text-xs aide:has-data-[slot=kbd]:pr-1.5 aide:**:data-[slot=kbd]:relative aide:**:data-[slot=kbd]:isolate aide:**:data-[slot=kbd]:z-50 aide:**:data-[slot=kbd]:rounded-sm aide:z-50 aide:w-fit aide:max-w-xs aide:origin-(--bits-tooltip-content-transform-origin) aide:bg-foreground aide:text-background",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		<TooltipPrimitive.Arrow>
			{#snippet child({ props })}
				<div
					class={cn(
						"aide:size-2.5 aide:translate-y-[calc(-50%_-_2px)] aide:rotate-45 aide:rounded-[2px] aide:z-50 aide:bg-foreground aide:fill-foreground aide:data-[side=bottom]:-translate-x-1/2 aide:data-[side=bottom]:-translate-y-[calc(-50%_+_1px)] aide:data-[side=left]:-translate-y-[calc(50%_-_3px)] aide:data-[side=right]:translate-x-[calc(50%_+_2px)] aide:data-[side=right]:translate-y-1/2 aide:data-[side=top]:translate-x-1/2 aide:data-[side=top]:translate-y-[calc(-50%_+_2px)]",
						arrowClasses
					)}
					{...props}
				></div>
			{/snippet}
		</TooltipPrimitive.Arrow>
	</TooltipPrimitive.Content>
</TooltipPortal>
