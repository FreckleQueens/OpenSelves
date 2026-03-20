<script lang="ts">
    import {Block, BlockTitle, Button, Preloader} from "konsta/svelte";
    import {onMount} from "svelte";
    import {Storage} from "$lib/storage";
    import {goto} from "$app/navigation";
    import {resolve} from "$app/paths";
    import {call, CallResult} from "$lib";

    let user: {
        id: string;
        email: string;
    } | undefined = undefined;

    const load = (async () => {const storage = await Storage.getStorage();
        if (storage.isOffline()) {
            await goto(resolve("/"));
        }
    })();
    onMount(async () => {
        await load;
        const storage = await Storage.getStorage();
        if (storage.isOffline()) {
            return;
        }

        const response = await call(`/user/${storage.getKey()}`);
        if (response === CallResult.AUTH_FAILED) {
            await storage.setOffline();
            await goto(resolve("/"));
        } else {
            if (!("id" in response && "email" in response)) {
                throw new Error("Bad server response");
            }
            user = {
                id: `${response.id}`,
                email: `${response.email}`,
            };
        }
    });

    const logoutButtonOnclick = async () => {
        const result = await call("/auth/logout", {
            method: "POST",
        });
        if (typeof result === "object") {
            const storage = await Storage.getStorage();
            await storage.setOffline();
            await goto(resolve("/"));
        }
    };
</script>

<Block>
    <p class="text-2xl">Welcome to OpenSelves!</p>
</Block>

<BlockTitle medium>Status</BlockTitle>
<Block strong inset>
    {#if user}
        <p>You are logged in as user #{user.id}, {user.email}</p>
    {:else}
        <Preloader/>
    {/if}
</Block>

<BlockTitle medium>Actions</BlockTitle>
<Block strong inset>
    <Button tonal raised onclick={logoutButtonOnclick}>Logout</Button>
</Block>
