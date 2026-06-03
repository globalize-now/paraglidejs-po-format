<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale, localizeHref } from '$lib/paraglide/runtime';
</script>

<h1 data-testid="greeting">{m.greeting({ name: 'World' })}</h1>

<p data-testid="locale">Current locale: {getLocale()}</p>

<ul>
	<li data-testid="apples-1">{m.appleCount({ count: 1 })}</li>
	<li data-testid="apples-2">{m.appleCount({ count: 2 })}</li>
	<li data-testid="apples-5">{m.appleCount({ count: 5 })}</li>
</ul>

<!-- data-sveltekit-reload forces a full navigation so the URL-strategy locale is
     re-resolved on the server and the page re-renders in the new language. -->
<nav data-sveltekit-reload>
	<a data-testid="to-en" href={localizeHref('/', { locale: 'en' })}>English</a>
	<a data-testid="to-de" href={localizeHref('/', { locale: 'de' })}>Deutsch</a>
	<a data-testid="to-pl" href={localizeHref('/', { locale: 'pl' })}>Polski</a>
</nav>
