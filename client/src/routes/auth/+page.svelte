<script lang="ts">
	import { goto } from "$app/navigation";
	import { resolve } from "$app/paths";
	import { type AuthFormData } from "$lib";
	import { apiState } from "$lib/api.svelte";
	import AppPage from "$lib/components/AppPage.svelte";
	import LoginFields from "$lib/components/LoginFields.svelte";
	import RegisterFields from "$lib/components/RegisterFields.svelte";
	import { SyncWorker } from "$lib/idb/SyncWorker.svelte";
	import { Storage } from "$lib/storage";
	import Icon from "@iconify/svelte";
	import {
		Block,
		BlockTitle,
		Button,
		Dialog,
		DialogButton,
		Link,
		Segmented,
		SegmentedButton,
		useTheme,
	} from "konsta/svelte";
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";

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
				const storage = await Storage.getStorage();
				await storage.setKey(`${result.userId}`);
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

	const onSubmit = async (e: SubmitEvent) => {
		e.preventDefault();
		return submitActiveForm();
	};

	async function submitActiveForm() {
		let response: Response;
		try {
			response = await fetch(`${apiState.url}${forms[activeForm].endpoint}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(forms[activeForm].data),
				credentials: "include",
			});
		} catch (error) {
			console.trace(error);
			if (
				error &&
				typeof error === "object" &&
				"message" in error &&
				typeof error.message === "string"
			) {
				forms[activeForm].generalError = error.message;
			}
			return;
		}
		const result = await response.json();

		if (!response.ok) {
			forms[activeForm].generalError = result.message;
			return;
		}
		console.log(result);
		return forms[activeForm].onSuccess(result);
	}

	async function loginFromRegistration() {
		forms.login.data = { ...forms.register.data };
		activeForm = forms.login.name;
		registerSuccessDialogOpen = false;
		return submitActiveForm();
	}

	const load = (async () => {
		const storage = await Storage.getStorage();
		if (!storage.isOffline()) {
			await goto(resolve("/"));
		}
	})();
	let loaded = $state(false);
	onMount(async () => {
		await load;
		loaded = true;
	});
</script>

<AppPage title="" showMenu={false} loading={!loaded} transparentNavbar>
	{#snippet navbarRight()}
		<Link href={resolve("/auth/settings")} id="settings-link">
			<Icon icon={useTheme() === "ios" ? "f7:" : "ic:round-settings"} class="text-3xl" />
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

	<Block>
		<Segmented strong rounded class="text-4xl">
			<SegmentedButton
				active={activeForm === "login"}
				onclick={() => (activeForm = forms.login.name)}
			>
				<Icon
					icon={useTheme() === "ios" ? "f7:square-arrow-right" : "ic:round-login"}
					class="text-2xl mr-1"
				/>
				Login
			</SegmentedButton>
			<SegmentedButton
				active={activeForm === "register"}
				onclick={() => (activeForm = forms.register.name)}
			>
				<Icon
					icon={useTheme() === "ios"
						? "f7:person-crop-circle-badge-plus"
						: "material-symbols:group-add-rounded"}
					class="text-2xl mr-1"
				/>
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
					<LoginFields formState={forms.login} />

					<Block class="mt-0">
						<Button type="submit" tonal>Login</Button>
					</Block>
				</form>
			{:else if activeForm === "register"}
				<form class="register" onsubmit={onSubmit} transition:fly={{ x: 200 }}>
					<RegisterFields formState={forms.register} />

					<Block class="mt-0">
						<Button type="submit" tonal>Register</Button>
					</Block>
				</form>
			{/if}
		</div>
	</Block>

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
				<Icon
					icon={useTheme() === "ios" ? "f7:square-arrow-right" : "ic:round-login"}
					class="text-2xl mr-2"
				/>
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
