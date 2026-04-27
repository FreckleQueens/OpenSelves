import type { Props as IconProps } from "konsta/svelte/types/Icon";
import type { Component } from "svelte";
import { HTMLAttributes } from "svelte/elements";

export type OSIconProps = {
	material?: Component;
	ios?: Component;
	all?: Component;
	secondary?: Component;
	button?: boolean;
	fab?: boolean;
	input?: boolean;
	before?: boolean;
	after?: boolean;
	class?: string;
	iconProps?: HTMLAttributes<HTMLElement>;
} & IconProps;
