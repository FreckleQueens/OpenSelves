<script lang="ts">
	import { PersistentStorage } from "$lib/PersistentStorage";
	import OSForm from "$lib/components/forms/OSForm.svelte";
	import EnvelopeIcon from "$lib/components/icons/EnvelopeIcon.svelte";
	import SuccessIcon from "$lib/components/icons/SuccessIcon.svelte";
	import type { OSFormData } from "$lib/forms";
	import humanizeDuration from "humanize-duration";
	import { ListItem } from "konsta/svelte";
	import type { GetUserResult } from "openselves-common";
	import { onMount } from "svelte";

	const VERIFICATION_EMAIL_SENT_AT_STORAGE_KEY = "verification-email-sent-at";

	let { user }: { user: GetUserResult | undefined } = $props();
	let storage: PersistentStorage | undefined = $state();
	let verificationEmailSentAt: number | undefined = $state();
	let timeToSendVerificationEmailAvailability: number | undefined = $derived(
		verificationEmailSentAt !== undefined
			? verificationEmailSentAt + 15 * 60 * 1000 - Date.now()
			: undefined,
	);
	let canResend: boolean = $derived(
		timeToSendVerificationEmailAvailability !== undefined &&
			timeToSendVerificationEmailAvailability <= 0,
	);
	let formState: OSFormData | undefined = $state();

	$effect(() => {
		if (formState) {
			formState.disabled = !canResend;
		}
	});

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

	async function onSuccess() {
		if (!user) {
			throw new Error("user is not defined");
		}
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
	<ListItem class="resend-verification-email-comp">
		{#snippet text()}
			<OSForm
				formName="resend-verification-email"
				endpoint={`/user/${user.id}/resend-verification-email`}
				submitWorkingStatus={t("Sending email...")}
				submitButtonIcon={EnvelopeIcon}
				submitButtonText={canResend
					? t("Resend verification email")
					: t(
							"(please wait {time} before trying again)",
							humanizeDuration(timeToSendVerificationEmailAvailability, {
								round: true,
								largest: 1,
							}),
						)}
				captcha
				captchaAction="sendEmail"
				captchaActionValue={user.newEmailRequest || user.email}
				{onSuccess}
				bind:formState
				inline
			/>

			{#if !canResend}
				<span class="flex items-center justify-center m-1">
					<SuccessIcon before class="text-brand-green" />
					Verification email sent.
				</span>
			{/if}
		{/snippet}
	</ListItem>
{/if}
