<script lang="ts">
    import {ListInput} from "konsta/svelte";
    import type {AuthFormData} from "$lib";
    import AuthFields from "$lib/components/AuthFields.svelte";

    let { formState }: { formState: AuthFormData } = $props();
</script>
<AuthFields formState={formState}>
    <ListInput
            label="Email"
            floatingLabel
            placeholder="alice@example.com"
            type="email"
            name="email"
            bind:value={formState.data["email"]}
            error={formState.errors["email"] || ""}
            pattern="^.+@.+\..{'{'}2,}$"
            required
    />
    <ListInput
            label="Password"
            floatingLabel
            type="password"
            name="password"
            bind:value={formState.data["password"]}
            error={formState.errors["password"] || ""}
            pattern=".{'{'}8,}"
            minlength={8}
            required
    />
</AuthFields>
