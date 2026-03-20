<script lang="ts">
    import {Block, List} from "konsta/svelte";
    import {onMount, type Snippet} from "svelte";
    import type {AuthFormData} from "$lib";

    let { children, formState }: { children: Snippet, formState: AuthFormData } = $props();

    let inputsContainer: HTMLElement;
    onMount(() => {
        const inputs = inputsContainer.querySelectorAll("input");
        for (const el of inputs) {
            el.addEventListener("input", (e) => {
                const target = e.target as HTMLInputElement;
                if (formState.errors[target.name]) {
                    target.checkValidity();
                    formState.errors[target.name] = target.validationMessage;
                }
            });
            el.addEventListener("invalid", (e) => {
                e.preventDefault();
                const target = e.target as HTMLInputElement;
                formState.errors[target.name] = target.validationMessage;
            });
        }
    });
</script>
<div bind:this={inputsContainer}>
    {#if formState.generalError}
        <Block class="text-red-500" inset nested>
            <p>Error: {formState.generalError}</p>
        </Block>
    {/if}
    <List nested>
        {@render children()}
    </List>
    <Block/>
</div>
