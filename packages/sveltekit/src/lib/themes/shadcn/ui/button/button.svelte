<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";
	import { cn, type WithElementRef } from "../../utils.js";
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

	export const buttonVariants = tv({
		base: "aide:focus-visible:border-ring aide:focus-visible:ring-ring/50 aide:aria-invalid:ring-destructive/20 aide:dark:aria-invalid:ring-destructive/40 aide:aria-invalid:border-destructive aide:dark:aria-invalid:border-destructive/50 aide:rounded-md aide:border aide:border-transparent aide:bg-clip-padding aide:text-sm aide:font-medium aide:focus-visible:ring-3 aide:aria-invalid:ring-3 aide:active:not-aria-[haspopup]:translate-y-px aide:[&_svg:not([class*='size-'])]:size-4 aide:group/button aide:inline-flex aide:shrink-0 aide:items-center aide:justify-center aide:whitespace-nowrap aide:transition-all aide:outline-none aide:select-none aide:disabled:pointer-events-none aide:disabled:opacity-50 aide:[&_svg]:pointer-events-none aide:[&_svg]:shrink-0",
		variants: {
			variant: {
				default: "aide:bg-primary aide:text-primary-foreground aide:hover:bg-primary/80",
				outline: "aide:border-border aide:bg-background aide:hover:bg-muted aide:hover:text-foreground aide:dark:bg-input/30 aide:dark:border-input aide:dark:hover:bg-input/50 aide:aria-expanded:bg-muted aide:aria-expanded:text-foreground aide:shadow-xs",
				secondary: "aide:bg-secondary aide:text-secondary-foreground aide:hover:bg-[color-mix(in_oklch,var(--secondary,var(--aide-fb-secondary)),var(--foreground,var(--aide-fb-foreground))_5%)] aide:aria-expanded:bg-secondary aide:aria-expanded:text-secondary-foreground",
				ghost: "aide:hover:bg-muted aide:hover:text-foreground aide:dark:hover:bg-muted/50 aide:aria-expanded:bg-muted aide:aria-expanded:text-foreground",
				destructive: "aide:bg-destructive/10 aide:hover:bg-destructive/20 aide:focus-visible:ring-destructive/20 aide:dark:focus-visible:ring-destructive/40 aide:dark:bg-destructive/20 aide:text-destructive aide:focus-visible:border-destructive/40 aide:dark:hover:bg-destructive/30",
				link: "aide:text-primary aide:underline-offset-4 aide:hover:underline",
			},
			size: {
				default: "aide:h-9 aide:gap-1.5 aide:px-2.5 aide:in-data-[slot=button-group]:rounded-md aide:has-data-[icon=inline-end]:pr-2 aide:has-data-[icon=inline-start]:pl-2",
				xs: "aide:h-6 aide:gap-1 aide:rounded-[min(var(--aide-radius-md),8px)] aide:px-2 aide:text-xs aide:in-data-[slot=button-group]:rounded-md aide:has-data-[icon=inline-end]:pr-1.5 aide:has-data-[icon=inline-start]:pl-1.5 aide:[&_svg:not([class*='size-'])]:size-3",
				sm: "aide:h-8 aide:gap-1 aide:rounded-[min(var(--aide-radius-md),10px)] aide:px-2.5 aide:in-data-[slot=button-group]:rounded-md aide:has-data-[icon=inline-end]:pr-1.5 aide:has-data-[icon=inline-start]:pl-1.5",
				lg: "aide:h-10 aide:gap-1.5 aide:px-2.5 aide:has-data-[icon=inline-end]:pr-2 aide:has-data-[icon=inline-start]:pl-2",
				icon: "aide:size-9",
				"icon-xs": "aide:size-6 aide:rounded-[min(var(--aide-radius-md),8px)] aide:in-data-[slot=button-group]:rounded-md aide:[&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "aide:size-8 aide:rounded-[min(var(--aide-radius-md),10px)] aide:in-data-[slot=button-group]:rounded-md",
				"icon-lg": "aide:size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
	export type ButtonSize = VariantProps<typeof buttonVariants>["size"];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	/* eslint-disable svelte/no-navigation-without-resolve -- generated shadcn-svelte button: the
	   caller owns `href`; the theme never renders it as a link. */
	let {
		class: className,
		variant = "default",
		size = "default",
		ref = $bindable(null),
		href = undefined,
		type = "button",
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? "link" : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
