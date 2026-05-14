<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { apiState, call, scheduleOnlineCheck } from "$lib/api.svelte";
	import { appState } from "$lib/appState.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import LoginFields from "$lib/components/forms/LoginFields.svelte";
	import RegisterFields from "$lib/components/forms/RegisterFields.svelte";
	import LoginIcon from "$lib/components/icons/LoginIcon.svelte";
	import RegisterIcon from "$lib/components/icons/RegisterIcon.svelte";
	import SettingsIcon from "$lib/components/icons/SettingsIcon.svelte";
	import type { AuthFormData } from "$lib/forms";
	import { SyncWorker } from "$lib/idb/SyncWorker.js";
	import { requireGuest } from "$lib/routing-utils";
	import {
		Block,
		BlockTitle,
		Button,
		Dialog,
		DialogButton,
		Link,
		Preloader,
		Segmented,
		SegmentedButton,
	} from "konsta/svelte";
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";

	const storage = PersistentStorage.getInstance();

	const forms: Record<string, AuthFormData> = $state({
		login: {
			name: "login",
			errors: {},
			generalError: "",
			endpoint: "/auth/login",
			data: {},
			onSuccess: async (result: object) => {
				if (!("userId" in result && result.userId)) {
					throw new Error("Bad response from server");
				}
				await storage.setUserId(`${result.userId}`);
				SyncWorker.getInstance().resume();
				await goto(resolve("/"));
			},
		},
		register: {
			name: "register",
			errors: {},
			generalError: "",
			endpoint: "/user",
			data: {},
			onSuccess: () => (registerSuccessDialogOpen = true),
		},
	});
	let activeForm = $state(forms.login.name);
	let registerSuccessDialogOpen = $state(false);
	let isWorking = $state(false);

	const load = requireGuest();
	let loaded = $state(false);
	onMount(async () => {
		await load;
		loaded = true;

		scheduleOnlineCheck(0);
	});

	$effect(() => {
		const form = forms[activeForm];
		if (form.autoVerifyCaptcha && form.data["captcha"]) {
			submitForm(form);
		}
	});

	const onSubmit = async (e: SubmitEvent) => {
		e.preventDefault();
		return submitActiveForm();
	};

	async function submitActiveForm() {
		return submitForm(forms[activeForm]);
	}

	async function submitForm(form: AuthFormData) {
		isWorking = true;
		try {
			let response: Response;
			try {
				response = await call(form.endpoint, {
					method: "POST",
					data: form.data,
					returnRawResponse: true,
				});

				if (!response) {
					appState.isApiReachable = false;
					scheduleOnlineCheck();
					return;
				}
			} catch (error) {
				console.trace(error);
				if (
					error &&
					typeof error === "object" &&
					"message" in error &&
					typeof error.message === "string"
				) {
					form.generalError = error.message;
				}
				return;
			}
			const result = await response.json();

			if (!response.ok) {
				form.generalError = result.message;
				return;
			}
			console.log(result);
			await form.onSuccess(result);
		} finally {
			isWorking = false;
		}
	}

	async function loginFromRegistration() {
		isWorking = true;
		forms.login.data = { ...forms.register.data, captcha: "" };
		forms.login.autoVerifyCaptcha = true;
		activeForm = forms.login.name;
		registerSuccessDialogOpen = false;
	}
</script>

<AppPage title="" showMenu={false} loading={!loaded} transparentNavbar>
	{#snippet navbarRight()}
		<Link href={resolve("/auth/settings")} id="settings-link">
			<SettingsIcon button />
		</Link>
	{/snippet}

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

	{#if appState.isApiReachable}
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

						<Block class="mt-0">
							<Button
								type="submit"
								tonal
								disabled={!forms.login.data["captcha"] || isWorking}
							>
								{#if isWorking}
									<Preloader />
								{:else}
									Login
								{/if}
							</Button>
						</Block>
					</form>
				{:else if activeForm === "register"}
					<form class="register" onsubmit={onSubmit} transition:fly={{ x: 200 }}>
						<RegisterFields bind:formState={forms.register} />

						<Block class="mt-0">
							<Button
								type="submit"
								tonal
								disabled={!forms.register.data["captcha"] || isWorking}
							>
								{#if isWorking}
									<Preloader />
								{:else}
									Register
								{/if}
							</Button>
						</Block>
					</form>
				{/if}
			</div>
		</Block>
	{:else}
		<Block class="text-center">
			<div class="m-8">
				{t("Waiting for {apiState.url}...", apiState.url)}
			</div>
			<Preloader />
		</Block>
	{/if}

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
			<DialogButton id="auto-login-button" strong onclick={loginFromRegistration}>
				<LoginIcon button before />
				Login
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
