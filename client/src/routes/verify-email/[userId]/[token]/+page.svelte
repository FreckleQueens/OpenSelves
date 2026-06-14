<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { transformErrorToReadable } from "$lib";
	import { call } from "$lib/api.svelte.js";
	import ContinueIcon from "$lib/components/icons/ContinueIcon.svelte";
	import CopyIcon from "$lib/components/icons/CopyIcon.svelte";
	import ErrorIcon from "$lib/components/icons/ErrorIcon.svelte";
	import ReloadIcon from "$lib/components/icons/ReloadIcon.svelte";
	import VerifiedIcon from "$lib/components/icons/VerifiedIcon.svelte";
	import { Dialog, DialogButton, Preloader } from "konsta/svelte";
	import { onMount } from "svelte";

	import type { PageProps } from "./$types";

	let { params }: PageProps = $props();
	let verified: boolean | undefined = $state();
	let error: string = $state("");

	onMount(async () => {
		try {
			await call("/user/" + params.userId + "/verify-email/" + params.token, {
				method: "POST",
			});
		} catch (e) {
			verified = false;
			error = JSON.stringify(transformErrorToReadable(e), undefined, 2);
			return;
		}

		verified = true;
	});

	async function copyErrorToClipboard() {
		await navigator.clipboard.write([
			new ClipboardItem({
				"text/plain": error,
			}),
		]);
	}

	function retryButtonOnclick() {
		window.location.reload();
	}

	function goToAppButtonOnclick() {
		goto(resolve("/"));
	}
</script>

{#if verified === undefined}
	<Preloader class="absolute top-1/2 left-1/2 -translate-1/2" />
{/if}

<Dialog opened={verified === false}>
	{#snippet title()}
		<span class="flex items-center">
			<ErrorIcon before class="text-brand-red" /> Error
		</span>
	{/snippet}

	<p>Your email was not verified.</p>
	<br />

	<code class="block max-h-64 overflow-auto whitespace-pre">{error}</code>

	{#snippet buttons()}
		<DialogButton class="k-color-brand-primary" onclick={copyErrorToClipboard}>
			<CopyIcon button before />
			Copy
		</DialogButton>
		<DialogButton strong onclick={retryButtonOnclick}>
			<ReloadIcon before button />
			Retry
		</DialogButton>
	{/snippet}
</Dialog>

<Dialog opened={verified}>
	{#snippet title()}
		<span class="flex items-center">
			<VerifiedIcon before class="text-brand-green" /> Email verified!
		</span>
	{/snippet}

	You can close this page.

	{#snippet buttons()}
		<DialogButton id="success-continue-button" strong onclick={goToAppButtonOnclick}>
			Go to app
			<ContinueIcon after button />
		</DialogButton>
	{/snippet}
</Dialog>
