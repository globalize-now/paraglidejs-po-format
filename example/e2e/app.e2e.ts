import { expect, test } from '@playwright/test';

// End-to-end proof that the DEPLOYED @globalize-now/paraglidejs-po-format plugin
// (loaded from jsdelivr in project.inlang/settings.json) flows all the way through:
// jsdelivr -> Paraglide module loader -> PO import -> compile -> SvelteKit render.
//
// The assertions pin the plugin's two non-trivial behaviors:
//   1. `{name}` placeholder interpolation
//   2. gettext-plural -> CLDR-category selection (incl. Polish one/few/many)

test('base locale (en) at / interpolates and selects 2 plural forms', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('greeting')).toHaveText('Hello World');
	await expect(page.getByTestId('apples-1')).toHaveText('1 apple'); // one
	await expect(page.getByTestId('apples-2')).toHaveText('2 apples'); // other
	await expect(page.getByTestId('apples-5')).toHaveText('5 apples'); // other
});

test('German at /de interpolates and selects 2 plural forms', async ({ page }) => {
	await page.goto('/de');
	await expect(page.getByTestId('greeting')).toHaveText('Hallo World');
	await expect(page.getByTestId('apples-1')).toHaveText('1 Apfel'); // one
	await expect(page.getByTestId('apples-2')).toHaveText('2 Äpfel'); // other
	await expect(page.getByTestId('apples-5')).toHaveText('5 Äpfel'); // other
});

test('Polish at /pl selects three distinct CLDR plural forms', async ({ page }) => {
	await page.goto('/pl');
	await expect(page.getByTestId('greeting')).toHaveText('Cześć World');
	await expect(page.getByTestId('apples-1')).toHaveText('1 jabłko'); // one
	await expect(page.getByTestId('apples-2')).toHaveText('2 jabłka'); // few
	await expect(page.getByTestId('apples-5')).toHaveText('5 jabłek'); // many
});

test('locale switch link navigates and re-renders translations', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('to-pl').click();
	await expect(page).toHaveURL(/\/pl\/?$/);
	await expect(page.getByTestId('greeting')).toHaveText('Cześć World');
	await expect(page.getByTestId('apples-2')).toHaveText('2 jabłka');
});
