<script lang="ts" module>
	export type Side = "top" | "right" | "bottom" | "left";
</script>

<script lang="ts">
	import { Dialog as SheetPrimitive } from "bits-ui";
	import XIcon from '@lucide/svelte/icons/x';
	import { Button } from "../button/index.js";
	import { cn, type WithoutChildrenOrChild } from "../../utils.js";
	import SheetOverlay from "./sheet-overlay.svelte";
	import SheetPortal from "./sheet-portal.svelte";
	import type { Snippet } from "svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		side = "right",
		showCloseButton = true,
		portalProps,
		children,
		...restProps
	}: WithoutChildrenOrChild<SheetPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SheetPortal>>;
		side?: Side;
		showCloseButton?: boolean;
		children: Snippet;
	} = $props();
</script>

<SheetPortal {...portalProps}>
	<SheetOverlay />
	<SheetPrimitive.Content
		bind:ref
		data-slot="sheet-content"
		data-side={side}
		class={cn(
			"aide:bg-popover aide:text-popover-foreground aide:fixed aide:z-50 aide:flex aide:flex-col aide:gap-4 aide:bg-clip-padding aide:text-sm aide:shadow-lg aide:transition aide:duration-200 aide:ease-in-out aide:data-[side=bottom]:inset-x-0 aide:data-[side=bottom]:bottom-0 aide:data-[side=bottom]:h-auto aide:data-[side=bottom]:border-t aide:data-[side=left]:inset-y-0 aide:data-[side=left]:left-0 aide:data-[side=left]:h-full aide:data-[side=left]:w-3/4 aide:data-[side=left]:border-r aide:data-[side=right]:inset-y-0 aide:data-[side=right]:right-0 aide:data-[side=right]:h-full aide:data-[side=right]:w-3/4 aide:data-[side=right]:border-l aide:data-[side=top]:inset-x-0 aide:data-[side=top]:top-0 aide:data-[side=top]:h-auto aide:data-[side=top]:border-b aide:data-[side=left]:sm:max-w-sm aide:data-[side=right]:sm:max-w-sm aide:data-open:animate-in aide:data-open:fade-in-0 aide:data-[side=bottom]:data-open:slide-in-from-bottom-10 aide:data-[side=left]:data-open:slide-in-from-left-10 aide:data-[side=right]:data-open:slide-in-from-right-10 aide:data-[side=top]:data-open:slide-in-from-top-10 aide:data-closed:animate-out aide:data-closed:fade-out-0 aide:data-[side=bottom]:data-closed:slide-out-to-bottom-10 aide:data-[side=left]:data-closed:slide-out-to-left-10 aide:data-[side=right]:data-closed:slide-out-to-right-10 aide:data-[side=top]:data-closed:slide-out-to-top-10",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<SheetPrimitive.Close data-slot="sheet-close">
				{#snippet child({ props })}
					<Button variant="ghost" class="aide:absolute aide:top-4 aide:right-4" size="icon-sm" {...props}>
						<XIcon  />
						<span class="aide:sr-only">Close</span>
					</Button>
				{/snippet}
			</SheetPrimitive.Close>
		{/if}
	</SheetPrimitive.Content>
</SheetPortal>
