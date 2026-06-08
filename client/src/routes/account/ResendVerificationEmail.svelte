<script lang="ts">
	import { PersistentStorage } from "$lib/PersistentStorage";
	import { call } from "$lib/api.svelte.js";
	import Captcha from "$lib/components/Captcha.svelte";
	import EmailIcon from "$lib/components/icons/EmailIcon.svelte";
	import humanizeDuration from "humanize-duration";
	import { Button, ListItem } from "konsta/svelte";
	import type { GetUserResult } from "openselves-common";
	import { onMount } from "svelte";

	const VERIFICATION_EMAIL_SENT_AT_STORAGE_KEY = "verification-email-sent-at";

	let { user = $bindable() }: { user: GetUserResult | undefined } = $props();
	let storage: PersistentStorage | undefined = $state();
	let captcha: string | undefined = $state();
	let verificationEmailSentAt: number | undefined = $state();
	let timeToSendVerificationEmailAvailability: number | undefined = $derived(
		verificationEmailSentAt !== undefined
			? verificationEmailSentAt + 15 * 60 * 1000 - Date.now()
			: undefined,
	);

	onMount(async () => {
		storage = PersistentStorage.getInstance();
		const storedTimestamp = await storage.get(VERIFICATION_EMAIL_SENT_AT_STORAGE_KEY);
		verificationEmailSentAt = storedTimestamp ? parseInt(storedTimestamp) : 0;
	});

	onMount(() => {
		const interval = window.setInterval(() => {
			// Re-calculate time to wait
			const val = verificationEmailSentAt;
			verificationEmailSentAt = undefined;
			verificationEmailSentAt = val;
		}, 1000);
		return () => window.clearInterval(interval);
	});

	async function resendVerificationEmailButtonOnclick() {
		if (!user) {
			throw new Error("user is not defined");
		}

		await call(`/user/${user.id}/resend-verification-email`, {
			method: "POST",
			data: {
				captcha,
			},
		});

		if (!storage) {
			throw new Error("storage is not defined");
		}
		verificationEmailSentAt = Date.now();
		await storage.setForUser(
			user.id,
			VERIFICATION_EMAIL_SENT_AT_STORAGE_KEY,
			verificationEmailSentAt.toString(),
		);
	}
</script>

{#if user && (!user.isEmailVerified || user.newEmailRequest) && timeToSendVerificationEmailAvailability !== undefined}
	<ListItem>
		{#snippet text()}
			{#if timeToSendVerificationEmailAvailability !== undefined && timeToSendVerificationEmailAvailability <= 0}
				<div class="flex items-center gap-8">
					<Captcha bind:value={captcha} />
					<Button
						id="resend-verification-email-button"
						tonal
						raised
						onclick={resendVerificationEmailButtonOnclick}
						disabled={!captcha}
					>
						<EmailIcon button before />
						Resend verification email
					</Button>
				</div>
			{:else}
				{t(
					"Verification email sent. (please wait {time} before trying again)",
					humanizeDuration(timeToSendVerificationEmailAvailability, {
						round: true,
						largest: 1,
					}),
				)}
			{/if}
		{/snippet}
	</ListItem>
{/if}
