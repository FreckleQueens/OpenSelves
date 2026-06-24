<script lang="ts">
	import { type Snippet, onMount } from "svelte";

	type Contributor = {
		index: number;
		name: string;
		link?: string;
		avatarSrc: string;
		avatarAlt: string;
	};
	let {
		children,
		contributorsSrc = $bindable(),
	}: { children?: Snippet; contributorsSrc: string } = $props();
	let contributors: Contributor[] = $state([]);
	let contributorsSortedRandomly: Contributor[] = $derived.by(() => {
		const array = [...contributors];
		for (let i = array.length - 1; i > 0; i--) {
			const randomIndex = Math.floor(Math.random() * (i + 1));
			[array[i], array[randomIndex]] = [array[randomIndex], array[i]];
		}
		return array;
	});
	onMount(async () => {
		const lines = contributorsSrc
			.split("\n")
			.map((line) => line.split("#", 2)[0].trim())
			.filter((line) => line.length > 0);
		contributors = lines.map((line, index) => {
			const [name, link, avatarUrl] = line.split(",").map((part) => part.trim());
			let avatarSrc: string, avatarAlt: string;
			if (avatarUrl) {
				avatarSrc = avatarUrl;
				avatarAlt = name + "'s custom avatar";
			} else if (link && /^https:\/\/github.com\/([^/]+)$/.test(link)) {
				avatarSrc = link + ".png?size=128";
				avatarAlt = name + "'s GitHub avatar";
			} else {
				avatarSrc = "https://github.com/identicons/" + name + ".png";
				avatarAlt = "https://github.com/identicons/" + name + ".png";
			}
			return {
				index,
				name,
				link,
				avatarSrc,
				avatarAlt,
			};
		});
	});
</script>

<p>
	As a community project, OpenSelves is made possible by the work and time selflessly donated by
	volunteers from various backgrounds. We&, the initiators of the project known as Freckles,
	acknowledge their·& efforts and thank them·& for their·& precious contributions to the project.
</p>
<br />

<p>The following is a list of all known contributors, sorted at random:</p>
{#if contributorsSortedRandomly.length}
	<ul class="contributors">
		{#snippet contributorDisplay(contributor: Contributor)}
			{#if contributor.avatarSrc}
				<img src={contributor.avatarSrc} alt={contributor.avatarAlt} />
			{/if}
			<span>{contributor.name}</span>
		{/snippet}

		{#each contributorsSortedRandomly as contributor (contributor.index)}
			<li>
				{#if contributor.link}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a href={contributor.link} target="_blank">
						{@render contributorDisplay(contributor)}
					</a>
				{:else}
					<div>
						{@render contributorDisplay(contributor)}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	{@render children?.()}
{/if}

<style lang="postcss">
	.contributors {
		margin: calc(2 * var(--spacing));
		display: flex;
		flex-wrap: wrap;
		gap: calc(4 * var(--spacing));
		text-align: center;

		li {
			min-width: calc(16 * var(--spacing));
			display: flex;
			flex-direction: column;

			a,
			div {
				flex: 1;
				display: flex;
				flex-direction: column;
				gap: var(--spacing);

				img {
					width: calc(16 * var(--spacing));
					height: calc(16 * var(--spacing));
					border-radius: calc(infinity * 1px);
					object-fit: cover;
				}
			}
		}
	}
</style>
