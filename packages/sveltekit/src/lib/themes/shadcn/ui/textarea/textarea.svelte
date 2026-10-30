<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from "../../utils.js";
	import type { HTMLTextareaAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		"data-slot": dataSlot = "textarea",
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		"aide:border-input aide:dark:bg-input/30 aide:focus-visible:border-ring aide:focus-visible:ring-ring/50 aide:aria-invalid:ring-destructive/20 aide:dark:aria-invalid:ring-destructive/40 aide:aria-invalid:border-destructive aide:dark:aria-invalid:border-destructive/50 aide:rounded-md aide:border aide:bg-transparent aide:px-2.5 aide:py-2 aide:text-base aide:shadow-xs aide:transition-[color,box-shadow] aide:focus-visible:ring-3 aide:aria-invalid:ring-3 aide:md:text-sm aide:flex aide:field-sizing-content aide:min-h-16 aide:w-full aide:outline-none aide:placeholder:text-muted-foreground aide:disabled:cursor-not-allowed aide:disabled:opacity-50",
		className
	)}
	bind:value
	{...restProps}></textarea>
