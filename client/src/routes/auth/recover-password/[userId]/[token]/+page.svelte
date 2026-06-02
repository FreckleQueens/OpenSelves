<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { scheduleOnlineCheck } from "$lib/api.svelte";
	import ApiReachableGate from "$lib/components/ApiReachableGate.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import BackLink from "$lib/components/BackLink.svelte";
	import FormFields from "$lib/components/forms/FormFields.svelte";
	import ContinueIcon from "$lib/components/icons/ContinueIcon.svelte";
	import InfoIcon from "$lib/components/icons/InfoIcon.svelte";
	import PasswordIcon from "$lib/components/icons/PasswordIcon.svelte";
	import { type OSFormData, submitOSForm } from "$lib/forms";
	import { requireGuest } from "$lib/routing-utils";
	import {
		Block,
		BlockTitle,
		Button,
		Dialog,
		DialogButton,
		List,
		ListInput,
		Preloader,
	} from "konsta/svelte";
	import { onMount } from "svelte";

	import type { PageProps } from "./$types";

	const { params }: PageProps = $props();

	// svelte-ignore state_referenced_locally
	let formState: OSFormData = $state({
		data: {
			token: params["token"],
		},
		endpoint: "/user/" + params["userId"] + "/recover-password",
		errors: {},
		generalError: "",
		name: "recover-password",
		onSuccess() {
			successDialogOpen = true;
		},
	});
	let isWorking = $state(false);
	let successDialogOpen = $state(false);

	const load = requireGuest();
	let loaded = $state(false);
	onMount(async () => {
		await load;
		loaded = true;

		scheduleOnlineCheck(0);
	});

	async function formOnSubmit(event: SubmitEvent) {
		event.preventDefault();
		isWorking = true;
		try {
			await submitOSForm(formState);
		} finally {
			isWorking = false;
		}
	}
</script>

<AppPage title="" showMenu={false} loading={!loaded} transparentNavbar>
	{#snippet navbarLeft()}
		<BackLink />
	{/snippet}

	<ApiReachableGate>
		<BlockTitle large>Change password</BlockTitle>
		<Block>
			<form onsubmit={formOnSubmit}>
				<FormFields bind:formState>
					<List>
						<ListInput
							label={t("New password")}
							floatingLabel
							type="password"
							name="newPassword"
							bind:value={formState.data["newPassword"]}
							error={formState.errors["newPassword"] || ""}
							pattern=".{'{'}8,}"
							minlength={8}
							required
							autocomplete="new-password"
						>
							{#snippet media()}
								<PasswordIcon input />
							{/snippet}
						</ListInput>
					</List>
				</FormFields>

				<Block class="mt-0">
					<Button type="submit" tonal disabled={isWorking}>
						{#if isWorking}
							<Preloader />
						{:else}
							Change password
						{/if}
					</Button>
				</Block>
			</form>
		</Block>
	</ApiReachableGate>
</AppPage>

<Dialog opened={successDialogOpen}>
	{#snippet title()}
		<span class="flex flex-row items-center">
			<InfoIcon before />
			Password changed
		</span>
	{/snippet}

	{#snippet buttons()}
		<DialogButton strong onclick={() => goto(resolve("/auth"))}>
			Go to login <ContinueIcon button after />
		</DialogButton>
	{/snippet}

	<p>You can now login with your new password.</p>
</Dialog>
