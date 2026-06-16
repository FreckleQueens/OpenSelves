<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY } from "$lib";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { scheduleOnlineCheck } from "$lib/api.svelte";
	import ApiReachableGate from "$lib/components/ApiReachableGate.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import SubmitButton from "$lib/components/forms/SubmitButton.svelte";
	import DangerIcon from "$lib/components/icons/DangerIcon.svelte";
	import DismissIcon from "$lib/components/icons/DismissIcon.svelte";
	import LoginIcon from "$lib/components/icons/LoginIcon.svelte";
	import RegisterIcon from "$lib/components/icons/RegisterIcon.svelte";
	import SettingsIcon from "$lib/components/icons/SettingsIcon.svelte";
	import { type OSFormData, submitOSForm } from "$lib/forms";
	import { SyncWorker } from "$lib/idb/SyncWorker.js";
	import { requireGuest } from "$lib/routing-utils";
	import {
		Block,
		BlockTitle,
		Button,
		Dialog,
		DialogButton,
		Link,
		Segmented,
		SegmentedButton,
	} from "konsta/svelte";
	import { onMount, tick } from "svelte";
	import { fly } from "svelte/transition";

	import LoginFields from "./LoginFields.svelte";
	import RegisterFields from "./RegisterFields.svelte";

	const storage = PersistentStorage.getInstance();

	const forms: Record<string, OSFormData> = $state({
		login: {
			name: "login",
			errors: {},
			generalError: "",
			endpoint: "/auth/login",
			data: {},
			submitWorkingStatus: t("Authenticating..."),
			onSuccess: async (result: object) => {
				if (!("userId" in result && result.userId)) {
					throw new Error("Bad response from server");
				}
				await storage.setUserId(`${result.userId}`);
				SyncWorker.getInstance().resume();
				await dismissWarnForRemainingLocalData();
				await goto(resolve("/"));
			},
		},
		register: {
			name: "register",
			errors: {},
			generalError: "",
			endpoint: "/user",
			data: {},
			submitWorkingStatus: t("Creating account..."),
			onSuccess: () => (registerSuccessDialogOpen = true),
		},
	});
	let activeForm = $state(forms.login.name);
	let registerSuccessDialogOpen = $state(false);
	let warnForRemainingLocalData: boolean = $state(false);

	const load = requireGuest();
	let loaded = $state(false);
	onMount(async () => {
		await load;
		loaded = true;

		scheduleOnlineCheck(0);

		warnForRemainingLocalData = !!(await storage.get(
			WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY,
			true,
		));
	});

	const onSubmit = async (e: SubmitEvent) => {
		e.preventDefault();
		return submitActiveForm();
	};

	async function submitActiveForm() {
		return submitOSForm(forms[activeForm]);
	}

	async function autofillLoginFromRegistration() {
		forms.login.data = { ...forms.register.data };
		activeForm = forms.login.name;
		registerSuccessDialogOpen = false;
		await tick();
	}

	async function dismissWarnForRemainingLocalData() {
		await storage.delete(WARN_FOR_REMAINING_LOCAL_DATA_STORAGE_KEY, true);
		warnForRemainingLocalData = false;
	}
</script>

<AppPage title="" showMenu={false} loading={!loaded} transparentNavbar>
	{#snippet navbarRight()}
		<Link href={resolve("/auth/settings")} id="settings-link">
			<SettingsIcon button />
		</Link>
	{/snippet}

	{#if warnForRemainingLocalData}
		<Block strong inset class="k-color-brand-yellow flex items-center">
			<DangerIcon before />
			<span class="flex-1">
				Your data is still on this device. Anyone with access to the app or the device's
				filesystem can read and modify it.
				<br />
				To delete your data, go to settings by clicking the cogwheel icon in the top right corner
				of this page.
			</span>
			<Button
				clear
				rounded
				small
				inline
				class="p-2"
				onclick={() => dismissWarnForRemainingLocalData()}
			>
				<DismissIcon />
			</Button>
		</Block>
	{/if}

	<BlockTitle class="app-welcome-title flex justify-start text-4xl mb-8!">
		<img
			src="/logo_trans.svg"
			alt={t(
				"A stylized ampersand gradually orange to pink from top to bottom. It has two overlapping implicit heart shapes in it.",
			)}
			class="h-20 m-2"
		/>
		OpenSelves
	</BlockTitle>

	<ApiReachableGate>
		<Block>
			<Segmented strong rounded class="text-4xl">
				<SegmentedButton
					active={activeForm === "login"}
					onclick={() => (activeForm = forms.login.name)}
				>
					<LoginIcon button before />
					Login
				</SegmentedButton>
				<SegmentedButton
					active={activeForm === "register"}
					onclick={() => (activeForm = forms.register.name)}
				>
					<RegisterIcon button before />
					Register
				</SegmentedButton>
			</Segmented>
		</Block>

		<Block class="overflow-hidden">
			<div
				class={{
					relative: true,
					[activeForm]: true,
				}}
			>
				{#if activeForm === "login"}
					<form class="login" onsubmit={onSubmit} transition:fly={{ x: -200 }}>
						<LoginFields bind:formState={forms.login} />

						<SubmitButton bind:formState={forms.login}>Login</SubmitButton>
					</form>
				{:else if activeForm === "register"}
					<form class="register" onsubmit={onSubmit} transition:fly={{ x: 200 }}>
						<RegisterFields bind:formState={forms.register} />

						<SubmitButton bind:formState={forms.register}>Register</SubmitButton>
					</form>
				{/if}
			</div>
		</Block>
	</ApiReachableGate>

	<Dialog opened={registerSuccessDialogOpen}>
		{#snippet title()}
			Success!
		{/snippet}

		<p>Your account has been created. Click "Login" to login with your account.</p>
		<br />
		<p>
			Please note that if you close the app instead, you will have to re-enter your
			credentials manually.
		</p>

		{#snippet buttons()}
			<DialogButton id="autofill-login-button" strong onclick={autofillLoginFromRegistration}>
				<LoginIcon button before />
				Go to login
			</DialogButton>
		{/snippet}
	</Dialog>
</AppPage>

<style lang="scss">
	form {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
	}

	.login > form.login {
		position: revert;
	}

	.register > form.register {
		position: revert;
	}
</style>
