import type { Props as IconProps } from "konsta/svelte/types/Icon";
import type { Snippet } from "svelte";

export type OSIconProps = {
	children?: Snippet;
	material?: Snippet;
	ios?: Snippet;
	secondaryIcon?: Snippet;
	button?: boolean;
	fab?: boolean;
	input?: boolean;
	before?: boolean;
	after?: boolean;
	class?: string;
} & IconProps;
