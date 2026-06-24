<script lang="ts">
	import { RawContributors } from "openselves-common-ui";

	import contributorsSrc from "../../../CONTRIBUTORS?raw";

	const key = 7;

	// function encode(val) {
	// 	let out = "";
	// 	let prev = 0;
	// 	for (let i = 0; i < val.length; i++) {
	// 		const char = val.charCodeAt(i)
	// 		out = out + String.fromCharCode(char + key + prev);
	// 		prev = char;
	// 	}
	// 	return btoa(out);
	// }

	let revealed = $state(false);
	function revealContactAddr(this: HTMLLinkElement, e: MouseEvent) {
		if (revealed) {
			return;
		}

		e.preventDefault();
		function d(val: string) {
			let obf = atob(val);
			let out = "";
			let prev = 0;
			for (let i = 0; i < obf.length; i++) {
				const char = obf.charCodeAt(i);
				out = out + String.fromCharCode(char - key - prev);
				prev = char - key - prev;
			}
			return out;
		}

		const obf = "atnk6dzL3ru25tza6N/Y6eLfqKTo4A==";
		const deobf = d(obf);
		this.innerHTML = deobf;
		this.setAttribute("href", "mailto:" + deobf);
		revealed = true;
	}
</script>

<svelte:head>
	<title>OpenSelves - Plural system mapping and front tracking app</title>
	<meta
		name="description"
		content="A free and open source, local-first app for system mapping and front tracking."
	/>
</svelte:head>

<header>
	<div class="container m-auto flex items-center gap-1">
		<a href="https://openselves.org" class="flex-1 flex items-center text-2xl font-light">
			<img
				class="w-12"
				src="logo_trans.svg"
				alt="A stylized ampersand gradually orange to pink from top to bottom. It has two overlapping implicit heart shapes in it."
			/>
			OpenSelves
		</a>

		<nav>
			<ul class="flex gap-2">
				<li><a href="https://discord.gg/Bx6XFt5rFN"><IconIcRoundDiscord /> Discord</a></li>
				<li>
					<a href="https://github.com/FreckleQueens/OpenSelves"
						><IconMdiGithub /> Github</a
					>
				</li>
				<li>
					<a class="tonal" href="https://client.openselves.org"
						>Open App <IconIcRoundArrowForward /></a
					>
				</li>
			</ul>
		</nav>
	</div>
</header>

<hr />

<main>
	<div class="container m-auto">
		<h1 class="text-3xl font-light">
			A free and open source, local-first app for system mapping and front tracking
		</h1>
	</div>
</main>

<section>
	<div class="container m-auto">
		<h2>Contributors</h2>
		<div>
			<RawContributors {contributorsSrc} />
		</div>
	</div>
</section>

<hr />

<section>
	<div class="container m-auto">
		<h2>Contact</h2>
		<p>
			<a href="about:blank;" onclick={revealContactAddr} class="button">Click to reveal</a>
		</p>
	</div>
</section>
