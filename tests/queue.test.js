const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS } = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// FEAT-031 (TASK-188): the full-screen Queue View off the audio player. Renders
// the server `playback` snapshot's four sections (NOW PLAYING / PLAY NEXT /
// FROM SOURCE / THEN) — no client queue math — with per-row delete + shift
// up/down (remove-queue-entry / move-queue-entry keyed on entry_id) and skip-to.
// The faithful installPlaybackBackend (fixtures/api.js) materializes the three
// section arrays and applies the edits, so the overlay round-trips.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installPlaybackBackend(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS) })
  }));
  await page.goto('/app/homeview/profile.html');
});

// Enter the audio player on the ootb album, starting at `trackId`. After entry
// now-playing = trackId and from_source = the album tracks after it.
async function enterPlayer(page, trackId, title) {
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
  await page.locator('.film-tile[data-id="ootb"]').click();
  await page.locator(`.detail-row[data-id="${trackId}"]`).click();
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect(page.locator('#audio-title')).toHaveText(title);
}

async function openQueue(page) {
  await page.keyboard.press('ArrowDown');           // summon the transport (auto-hides)
  await page.locator('#btn-queue').click();
  await expect(page.locator('#queue-overlay')).toHaveClass(/open/);
}

function row(page, name) {
  return page.locator('.q-row', { has: page.getByText(name, { exact: false }) });
}

test('Queue button opens the overlay with NOW PLAYING + FROM SOURCE + Source-ends THEN', async ({ page }) => {
  await enterPlayer(page, 'ootb-02', 'Mr. Blue Sky');   // ordered, no repeat -> THEN ends
  await openQueue(page);
  await expect(page.locator('.now-playing .np-title')).toHaveText('Mr. Blue Sky');
  // from_source = the one track after ootb-02.
  await expect(row(page, 'Sweet Talkin Woman')).toHaveCount(1);
  await expect(page.locator('.q-ends')).toContainText('Source ends');
});

test('shifting a FROM SOURCE row down POSTs move-queue-entry (entry_id + direction) and reorders', async ({ page }) => {
  const moves = [];
  page.on('request', req => {
    [req].filter(r => r.url().includes('/api/playback/move-queue-entry')).forEach(r => moves.push(JSON.parse(r.postData() || '{}')));
  });
  await enterPlayer(page, 'ootb-01', 'Turn to Stone');  // from_source = [Mr. Blue Sky, Sweet Talkin Woman]
  await openQueue(page);
  // First FROM SOURCE row can't shift up (would swap with the now-playing track).
  await expect(row(page, 'Mr. Blue Sky').getByRole('button', { name: 'Shift up' })).toBeDisabled();
  await row(page, 'Mr. Blue Sky').getByRole('button', { name: 'Shift down' }).click();
  await expect.poll(() => moves.length).toBeGreaterThan(0);
  expect(moves[0]).toHaveProperty('entry_id');
  expect(moves[0]).toHaveProperty('direction', 'down');
  expect(moves[0]).not.toHaveProperty('to_index');   // section-relative index was the bug
  // Re-rendered from the new snapshot: Sweet Talkin Woman is now first in source.
  await expect(page.locator('.q-row').first().locator('.q-name')).toContainText('Sweet Talkin Woman');
});

test('toggling Shuffle inside the Queue View flips it (live, no exit)', async ({ page }) => {
  await enterPlayer(page, 'ootb-02', 'Mr. Blue Sky');
  await openQueue(page);
  const shuffle = page.locator('.np-pill', { hasText: 'Shuffle' });
  await expect(shuffle).not.toHaveClass(/on/);
  await shuffle.click();
  await expect(shuffle).toHaveClass(/on/);
  // BUG-015: shuffle has no say over THEN — repeat is still off, so the source
  // still ends on exhaustion and the Source-ends marker stays.
  await expect(page.locator('.q-ends')).toContainText('Source ends');
});

// BUG-041: the shuffled (`.on`) pill must be visually distinct from a merely
// focused-but-OFF pill. The old CSS painted `.on` with a near-transparent
// surface-hi tint + the same white --focus border a focused-off pill gets, so a
// focused-off Shuffle pill read as "shuffled". ON is now a solid --focus fill.
test('BUG-041: the ON (shuffled) pill is a solid fill, distinct from a focused-OFF pill', async ({ page }) => {
  await enterPlayer(page, 'ootb-02', 'Mr. Blue Sky');   // shuffle OFF
  await openQueue(page);
  const shuffle = page.locator('.np-pill', { hasText: 'Shuffle' });
  // Focused but OFF must NOT look filled (the old collapse: focus ≈ on).
  await shuffle.focus();
  await expect(shuffle).not.toHaveClass(/on/);
  const focusedOffBg = await shuffle.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(focusedOffBg).toBe('rgba(0, 0, 0, 0)');        // transparent — a focus ring only
  // Toggle ON -> an opaque solid --focus fill (fails on the old surface-hi tint).
  await shuffle.click();
  await expect(shuffle).toHaveClass(/on/);
  const onBg = await shuffle.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(onBg).toBe('rgb(255, 255, 255)');              // solid --focus fill
  expect(onBg).not.toBe(focusedOffBg);                  // ON distinguishable from focused-OFF
});

test('deleting a FROM SOURCE row POSTs remove-queue-entry and the row disappears', async ({ page }) => {
  await enterPlayer(page, 'ootb-01', 'Turn to Stone');
  await openQueue(page);
  await expect(row(page, 'Sweet Talkin Woman')).toHaveCount(1);
  await row(page, 'Sweet Talkin Woman').getByRole('button', { name: 'Remove' }).click();
  await expect(row(page, 'Sweet Talkin Woman')).toHaveCount(0);
});

test('selecting a FROM SOURCE row skips to it (play-track) and updates NOW PLAYING', async ({ page }) => {
  await enterPlayer(page, 'ootb-01', 'Turn to Stone');
  await openQueue(page);
  await row(page, 'Sweet Talkin Woman').locator('.q-select').click();
  await expect(page.locator('.now-playing .np-title')).toHaveText('Sweet Talkin Woman');
});

test('a queued track appears under PLAY NEXT, before FROM SOURCE', async ({ page }) => {
  await enterPlayer(page, 'ootb-01', 'Turn to Stone');
  // Simulate the (deferred) browse "Queue" affordance: a queue-track action.
  await page.evaluate(() => fetch('/api/playback/queue-track?person=kids', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ track_id: 'dancing-queen' })
  }));
  await openQueue(page);
  await expect(page.locator('.q-row.queued')).toContainText('Dancing Queen');
  // PLAY NEXT (queued) renders before FROM SOURCE (source-generated).
  const rows = page.locator('.q-row');
  await expect(rows.first()).toHaveClass(/queued/);
});

test('toggling repeat fills THEN with the next permutation (no Source-ends)', async ({ page }) => {
  await enterPlayer(page, 'ootb-02', 'Mr. Blue Sky');
  await openQueue(page);
  await expect(page.locator('.q-ends')).toContainText('Source ends');
  // TASK-237 removed the player's repeat pill — repeat is toggled inside the Queue
  // View now (live, no exit), like Shuffle above. BUG-015: repeat (not shuffle)
  // populates THEN.
  await page.locator('.np-pill', { hasText: 'Repeat' }).click();
  await expect(page.locator('.q-ends')).toHaveCount(0);
});

test('Back closes the overlay and returns focus to the Queue button', async ({ page }) => {
  await enterPlayer(page, 'ootb-02', 'Mr. Blue Sky');
  await openQueue(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#queue-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#btn-queue')).toBeFocused();
});

test('TASK-216: clicking the breadcrumb closes the overlay to the still-playing player', async ({ page }) => {
  await enterPlayer(page, 'ootb-02', 'Mr. Blue Sky');
  await openQueue(page);
  // The breadcrumb is a real control, not dead text (the only non-keyboard way back).
  await page.locator('#queue-crumb-back').click();
  await expect(page.locator('#queue-overlay')).not.toHaveClass(/open/);
  await expect(page.locator('#btn-queue')).toBeFocused();
  // No page nav: still on the audio player, NOW PLAYING unchanged (audio kept playing).
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect(page.locator('#audio-title')).toHaveText('Mr. Blue Sky');
});

test('d-pad navigates rows and Enter fires the focused remove control', async ({ page }) => {
  await enterPlayer(page, 'ootb-01', 'Turn to Stone');
  await openQueue(page);                              // focus lands on the now-playing transport (row 0)
  await page.keyboard.press('ArrowDown');             // -> row 1 = the tab bar (Queue/Next/Coming Up)
  await page.keyboard.press('ArrowDown');             // -> first Next row (Mr. Blue Sky), select cell
  await page.keyboard.press('ArrowRight');            // -> shift down (shift-up disabled on the first row)
  await page.keyboard.press('ArrowRight');            // -> remove
  await expect(row(page, 'Mr. Blue Sky')).toHaveCount(1);
  await page.keyboard.press('Enter');                 // remove the focused row
  await expect(row(page, 'Mr. Blue Sky')).toHaveCount(0);
});

// TASK-238: the sections live under Queue / Next / Coming Up tabs above a persistent
// Now Playing header. With nothing queued the view opens on Next (the source list);
// switching to Coming Up reveals the end-of-source marker.
test('the Queue View lays the sections out as Queue / Next / Coming Up tabs', async ({ page }) => {
  await enterPlayer(page, 'ootb-02', 'Mr. Blue Sky');   // ordered, nothing queued
  await openQueue(page);
  await expect(page.locator('.now-playing .np-title')).toHaveText('Mr. Blue Sky');   // persistent header
  await expect(page.locator('.qtab')).toHaveText(['Queue', 'Next', 'Coming Up']);
  await expect(page.locator('.qtab[data-tab="next"]')).toHaveClass(/active/);         // opens on Next
  await page.locator('.qtab[data-tab="coming-up"]').click();
  await expect(page.locator('.qtab-panel.active .q-ends')).toContainText('Source ends');
});
