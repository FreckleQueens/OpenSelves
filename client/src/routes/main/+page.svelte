<script lang="ts">
    import {Block, Preloader} from "konsta/svelte";
    import {onMount} from "svelte";
    import {Storage} from "$lib/storage";
    import {goto} from "$app/navigation";
    import {resolve} from "$app/paths";
    import {call, CallResponse} from "$lib";

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
        if (response === CallResponse.AUTH_FAILED) {
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
</script>

<Block class="text-center">
    <p>Welcome to OpenSelves!</p>

    {#if user}
        <p>You are logged in as user #{user.id}, {user.email}</p>
    {:else}
        <Preloader/>
    {/if}
</Block>