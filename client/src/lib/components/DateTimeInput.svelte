<script lang="ts" generics="Hidden extends true | false = false">
	import DateTimeInputIcon from "$lib/components/icons/DateTimeInputIcon.svelte";
	import { ListInput } from "konsta/svelte";
	import type { FormEventHandler, HTMLAttributes } from "svelte/elements";

	import type { Props as ListInputProps } from "../../../../node_modules/konsta/svelte/types/ListInput";

	type Props = {
		hidden?: Hidden;
		name: string;
		value: Date | null;
		onInput: (date: Date | null) => Promise<void> | void;
		open?: () => void;
		min?: Date | undefined;
		max?: Date | undefined;
	};
	type CompProps = Hidden extends true ? HTMLAttributes<HTMLInputElement> : ListInputProps;

	let {
		hidden,
		name,
		value = $bindable(),
		onInput = $bindable(),
		// eslint-disable-next-line no-useless-assignment
		open = $bindable(),
		min,
		max,
		...rest
	}: Props & Omit<CompProps, keyof Props> = $props();

	let inputEl: HTMLInputElement | null = $state(null);
	// eslint-disable-next-line no-useless-assignment
	open = function () {
		// In Firefox desktop, datetime-local currently fails to display a time picker
		// See https://bugzilla.mozilla.org/show_bug.cgi?id=1726107
		const userAgent = navigator.userAgent.toLowerCase();
		if (
			userAgent.includes("firefox") &&
			!userAgent.includes("mobile") &&
			!userAgent.includes("android")
		) {
			inputEl?.classList.remove("hidden");
			inputEl?.focus();
		}
		inputEl?.showPicker();
	};

	const localOnInput: FormEventHandler<HTMLInputElement> = (event) => {
		const newValue = event.currentTarget?.value;
		if (!newValue) return;
		return onInput(new Date(newValue));
	};
	function onClear() {
		onInput(null);
	}

	let minDate = $derived(
		min ? new Date(Date.now() - min.getTimezoneOffset() * 60 * 1000) : undefined,
	);
	let maxDate = $derived(
		max ? new Date(Date.now() - max.getTimezoneOffset() * 60 * 1000) : undefined,
	);
	let val = $derived(
		value ? new Date(value.getTime() - value.getTimezoneOffset() * 60 * 1000) : undefined,
	);

	function isInputProps(props: unknown): props is HTMLAttributes<HTMLInputElement> {
		return !!props && !!hidden;
	}

	function isListProps(props: unknown): props is ListInputProps {
		return !!props && !hidden;
	}
</script>

{#if isInputProps(rest)}
	<!-- onblur is part of the firefox desktop datetime picker bug workaround -->
	<input
		bind:this={inputEl}
		class="hidden"
		type="datetime-local"
		{name}
		value={val ? val.toISOString().slice(0, 16) : undefined}
		min={minDate ? minDate.toISOString().slice(0, 16) : undefined}
		max={maxDate ? maxDate.toISOString().slice(0, 16) : undefined}
		onclick={(ev) => ev.stopPropagation()}
		oninput={localOnInput}
		onblur={(ev) => ev.currentTarget?.classList.add("hidden")}
		{...rest}
	/>
{:else if isListProps(rest)}
	<ListInput
		type="datetime-local"
		{name}
		value={val ? val.toISOString().slice(0, 16) : undefined}
		min={minDate ? minDate.toISOString().slice(0, 16) : undefined}
		max={maxDate ? maxDate.toISOString().slice(0, 16) : undefined}
		onclick={(ev) => ev.stopPropagation()}
		onInput={localOnInput}
		{onClear}
		{...rest}
	>
		{#snippet media()}
			<DateTimeInputIcon input />
		{/snippet}
	</ListInput>
{:else}
	{"" + "Couldn't determine rest props type"}
{/if}
