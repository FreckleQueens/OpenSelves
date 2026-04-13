<script lang="ts">
	import type { ClickEventHandler } from "$lib";
	import VerticalMenuIcon from "$lib/components/icons/VerticalMenuIcon.svelte";
	import { Fab } from "konsta/svelte";
	import type { Component } from "svelte";
	import { crossfade, fly, scale } from "svelte/transition";

	let {
		menuItems,
		pageContent = $bindable(),
	}: {
		menuItems: {
			id: string;
			icon: Component;
			action: ClickEventHandler;
		}[];
		pageContent: HTMLDivElement | undefined;
	} = $props();

	let scrolling = $state(false);
	let scrollTimeout: number | undefined = undefined;
	let onScrollEnd = () => {
		clearTimeout(scrollTimeout);
		scrollTimeout = window.setTimeout(() => {
			scrolling = false;
		}, 250);
	};

	$effect(() => {
		pageContent?.addEventListener("scroll", () => {
			clearTimeout(scrollTimeout);
			scrolling = true;
			showFabMenu = false;
		});
		pageContent?.addEventListener("scrollend", () => {
			onScrollEnd();
		});
	});

	let showFabMenu = $state(false);
	function openFabMenu(event: Event) {
		event.stopPropagation();
		event.preventDefault();
		showFabMenu = true;
	}
	window.addEventListener("mousedown", (event: MouseEvent) => {
		if (!event.target?.["closest"]?.("[role=button]")) {
			showFabMenu = false;
		}
	});
	const [send, receive] = crossfade({});
	const transitionDuration = 150;
</script>

<div>
	{#if !scrolling}
		<div
			class="absolute right-safe-4 bottom-safe-4 z-20 flex flex-col items-center"
			transition:fly={{ y: 150, opacity: 1, duration: transitionDuration }}
		>
			{#if showFabMenu}
				{#each [...menuItems.slice(1)].reverse() as item, i (item.id)}
					<div transition:fly|global={{ y: (i + 1) * 50, duration: transitionDuration }}>
						<div transition:scale|global={{ duration: transitionDuration }}>
							<Fab
								id={item.id + "-button"}
								class="k-color-brand-secondary size-10 mb-3"
								onclick={item.action}
							>
								{#snippet icon()}
									{@const Comp = item.icon}
									<Comp fab />
								{/snippet}
							</Fab>
						</div>
					</div>
				{/each}

				<div
					in:receive={{ key: "main", duration: transitionDuration }}
					out:send={{ key: "main", duration: transitionDuration }}
				>
					<Fab
						id={menuItems[0].id + "-button"}
						class="k-color-brand-primary"
						onclick={menuItems[0].action}
					>
						{#snippet icon()}
							{@const Comp = menuItems[0].icon}
							<Comp fab />
						{/snippet}
					</Fab>
				</div>
			{:else}
				<div
					class="absolute bottom-0 right-0"
					in:receive={{ key: "main" }}
					out:send={{ key: "main" }}
				>
					<Fab
						id="open-fab-menu-button"
						class="k-color-brand-primary size-10"
						onclick={openFabMenu}
						oncontextmenu={openFabMenu}
					>
						{#snippet icon()}
							<VerticalMenuIcon fab />
						{/snippet}
					</Fab>
				</div>
			{/if}
		</div>
	{/if}
</div>
