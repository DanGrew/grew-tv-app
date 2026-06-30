const { test, expect } = require('@playwright/test');
const { installApi, installPlaybackBackend, BROWSE, MUSIC_CARDS, PLAYLIST_CARDS } = require('./fixtures/api.js');

// FEAT-036 (TASK-204) — user playlists: the Music-tab Playlists rail + the
// playlist detail screen (reusing the album-detail layout) + play wiring to the
// FEAT-031 `playlist` source. A playlist is a music-section browse card
// distinguished by collectionType:'playlist'; it lives in its own rail (after
// Albums) and routes to playlist-detail.html (/api/playlist), never album detail.
// An empty playlist is valid: it still lists and opens. Music + playlist browse
// cards are injected here so the video-only suites keep their exact tab set.

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installPlaybackBackend(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: BROWSE.kids.genreLabels, content: BROWSE.kids.content.concat(MUSIC_CARDS).concat(PLAYLIST_CARDS) })
  }));
  await page.goto('/app/homeview/profile.html');
});

async function enterMusic(page) {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('.sidebar-tab[data-tab="music"]').click();
}

test('Music tab gains a Playlists rail (under Continue Listening, TASK-234) listing playlists, including an empty one', async ({ page }) => {
  await enterMusic(page);
  await expect(page.locator('.rail-title')).toHaveText(['Playlists', 'Artists', 'Albums']);
  const rail = page.locator('.rail-row[data-rail="playlists"]');
  // TASK-208: a leading "＋ New Playlist" create tile precedes Road Trip + empty.
  await expect(rail.locator('.film-tile')).toHaveCount(3);
  await expect(rail.locator('.film-tile').first()).toHaveAttribute('data-id', 'create-playlist');
  await expect(rail.locator('.film-tile[data-id="pl-roadtrip"] .tile-title')).toHaveText('Road Trip');
  await expect(rail.locator('.film-tile[data-id="pl-empty"]')).toHaveCount(1); // empty playlist still listed
});

test('a playlist card does NOT leak into the Albums rail', async ({ page }) => {
  await enterMusic(page);
  await expect(page.locator('.rail-row[data-rail="albums"] .film-tile[data-id="pl-roadtrip"]')).toHaveCount(0);
  await expect(page.locator('.rail-row[data-rail="albums"] .film-tile[data-id="ootb"]')).toHaveCount(1);
});

test('selecting a playlist opens the playlist detail (not album detail) with its ordered tracks', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="pl-roadtrip"]').click();
  await expect(page).toHaveURL(/playlist-detail\.html/);
  await expect(page.locator('#detail-title')).toHaveText('Road Trip');
  // Stored order preserved: ootb-03 then ootb-01 (a playlist is not album order).
  await expect(page.locator('.detail-row')).toHaveCount(2);
  await expect(page.locator('.detail-row').first()).toHaveAttribute('data-id', 'ootb-03');
  await expect(page.locator('#btn-play-next')).toBeVisible();
  await expect(page.locator('#btn-shuffle')).toBeVisible();
});

test('an empty playlist opens its detail with no track rows', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="pl-empty"]').click();
  await expect(page).toHaveURL(/playlist-detail\.html/);
  await expect(page.locator('#detail-title')).toHaveText('Empty Mix');
  await expect(page.locator('.detail-row')).toHaveCount(0);
});

// FEAT-039 (TASK-244) — playlist cover renders a 2x2 mosaic of member album art
// (backend TASK-233 coverArt[]). Road Trip carries 2 refs (degrade-2: two cells);
// the empty playlist has none -> the existing music placeholder, both on the rail
// tile and the detail header.

test('a playlist rail tile renders a cover mosaic of its member album art', async ({ page }) => {
  await enterMusic(page);
  const tile = page.locator('.rail-row[data-rail="playlists"] .film-tile[data-id="pl-roadtrip"]');
  await expect(tile.locator('.cover-mosaic')).toHaveCount(1);
  await expect(tile.locator('.cover-mosaic .cover-mosaic-cell')).toHaveCount(2); // 2 refs -> 2 cells
});

test('an empty playlist tile falls back to the placeholder (no mosaic)', async ({ page }) => {
  await enterMusic(page);
  const tile = page.locator('.rail-row[data-rail="playlists"] .film-tile[data-id="pl-empty"]');
  await expect(tile.locator('.cover-mosaic')).toHaveCount(0);
  await expect(tile.locator('.film-poster-placeholder')).toBeVisible();
});

test('the playlist detail header shows the cover mosaic', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="pl-roadtrip"]').click();
  await expect(page.locator('.detail-row')).toHaveCount(2);
  await expect(page.locator('#detail-header-mosaic')).toBeVisible();
  await expect(page.locator('#detail-header-mosaic .cover-mosaic-cell')).toHaveCount(2);
  await expect(page.locator('#detail-header-placeholder')).toBeHidden();
});

test('an empty playlist detail header shows the placeholder, not a mosaic', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="pl-empty"]').click();
  await expect(page).toHaveURL(/playlist-detail\.html/);
  await expect(page.locator('#detail-title')).toHaveText('Empty Mix');
  await expect(page.locator('#detail-header-mosaic')).toBeHidden();
  await expect(page.locator('#detail-header-placeholder')).toBeVisible();
});

test('selecting a playlist track plays it in the <audio> player as a queue source', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="pl-roadtrip"]').click();
  await page.locator('.detail-row[data-id="ootb-01"]').click();
  await expect(page).toHaveURL(/audio\.html/);
  await expect(page.locator('#screen-audio')).toBeVisible();
  await expect(page.locator('#audio-title')).toHaveText('Turn to Stone');
  const src = await page.locator('#audio').getAttribute('src');
  expect(src).toContain('/media/ootb-01.m4a');
  // Playlist is a queue source -> prev/next present (not a single's hidden state).
  await expect(page.locator('#btn-prev')).toBeVisible();
  await expect(page.locator('#btn-next')).toBeVisible();
});

test('Shuffle from playlist detail starts the player with shuffle engaged', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="pl-roadtrip"]').click();
  await expect(page.locator('.detail-row')).toHaveCount(2); // wait for load (shuffle no-ops on empty items)
  await page.locator('#btn-shuffle').click();
  await expect(page).toHaveURL(/audio\.html/);
  await expect(page.locator('#btn-shuffle.on')).toBeVisible();
});

test('Back from the playlist detail returns to browse', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="pl-roadtrip"]').click();
  await expect(page.locator('.detail-row')).toHaveCount(2);
  await page.keyboard.press('Backspace');
  await expect(page).toHaveURL(/browse\.html/);
});

// FEAT-036 (TASK-208) — create / delete UI.

async function typeName(page, text) {
  for (const ch of text) {
    await page.locator('#pl-keys button').filter({ hasText: new RegExp('^' + ch + '$') }).click();
  }
}

test('the create tile opens the create screen with an empty name placeholder', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="create-playlist"]').click();
  await expect(page).toHaveURL(/playlist-create\.html/);
  await expect(page.locator('#pl-name')).toHaveClass(/placeholder/);
});

test('typing a name on the on-screen keyboard then Create opens the new playlist detail', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="create-playlist"]').click();
  await typeName(page, 'ROADIES');
  await expect(page.locator('#pl-name')).toHaveText('ROADIES');
  await page.locator('#btn-create').click();
  await expect(page).toHaveURL(/playlist-detail\.html\?playlist=pl-roadies/);
  await expect(page.locator('#detail-title')).toHaveText('ROADIES');
});

test('Create with a blank name is rejected with an error and stays on the create screen', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="create-playlist"]').click();
  await page.locator('#btn-create').click();
  await expect(page.locator('#error-msg')).toBeVisible();
  await expect(page).toHaveURL(/playlist-create\.html/);
});

test('the create screen offers a kids/adults profile picker (active profile preselected)', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="create-playlist"]').click();
  await expect(page.locator('#btn-profile-kids')).toHaveClass(/selected/);
  await page.locator('#btn-profile-adults').click();
  await expect(page.locator('#btn-profile-adults')).toHaveClass(/selected/);
  await expect(page.locator('#btn-profile-kids')).not.toHaveClass(/selected/);
});

test('Delete on the playlist detail confirms then returns to browse', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="pl-roadtrip"]').click();
  await expect(page.locator('.detail-row')).toHaveCount(2);
  await page.locator('#btn-delete-playlist').click();
  await expect(page.locator('#confirm-delete')).toBeVisible();
  await expect(page.locator('#confirm-delete-name')).toHaveText('Road Trip');
  await page.locator('#btn-confirm-delete').click();
  await expect(page).toHaveURL(/browse\.html/);
});

test('Cancel on the delete confirm keeps the playlist and closes the dialog', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="pl-roadtrip"]').click();
  await expect(page.locator('.detail-row')).toHaveCount(2);
  await page.locator('#btn-delete-playlist').click();
  await expect(page.locator('#confirm-delete')).toBeVisible();
  await page.locator('#btn-cancel-delete').click();
  await expect(page.locator('#confirm-delete')).toBeHidden();
  await expect(page).toHaveURL(/playlist-detail\.html/);
});

// FEAT-036 (TASK-210) — rename. The detail screen's Rename hands off to the shared
// name screen in rename mode: prefilled name, NO profile picker (profile is
// immutable), and Save returns to the same playlist (id unchanged) with the new
// title.

async function openRename(page) {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="pl-roadtrip"]').click();
  await expect(page.locator('.detail-row')).toHaveCount(2);
  await page.locator('#btn-rename-playlist').click();
  await expect(page).toHaveURL(/playlist-create\.html\?rename=pl-roadtrip/);
}

test('Rename opens the name screen prefilled with the current name and no profile picker', async ({ page }) => {
  await openRename(page);
  await expect(page.locator('#create-title')).toHaveText('Rename Playlist');
  await expect(page.locator('#pl-name')).toHaveText('Road Trip');
  await expect(page.locator('#btn-profile-kids')).toHaveCount(0); // profile immutable -> picker absent
  await expect(page.locator('#btn-create')).toHaveText(/Save/);
});

test('Rename: clearing, typing a new name and Save returns to the same playlist with the new title', async ({ page }) => {
  await openRename(page);
  await page.locator('#pl-keys button').filter({ hasText: /^Clear$/ }).click();
  await typeName(page, 'TRIP2');
  await expect(page.locator('#pl-name')).toHaveText('TRIP2');
  await page.locator('#btn-create').click();
  await expect(page).toHaveURL(/playlist-detail\.html\?playlist=pl-roadtrip/); // id is permanent
  await expect(page.locator('#detail-title')).toHaveText('TRIP2');
});

test('Rename with a blank name is rejected with an error and stays on the name screen', async ({ page }) => {
  await openRename(page);
  await page.locator('#pl-keys button').filter({ hasText: /^Clear$/ }).click();
  await page.locator('#btn-create').click();
  await expect(page.locator('#error-msg')).toBeVisible();
  await expect(page).toHaveURL(/playlist-create\.html\?rename=pl-roadtrip/);
});

// FEAT-036 (TASK-211) — per-track reorder (↑ ↓) + remove (✕) on the playlist
// detail. Each POSTs BY POSITION then reloads, so the list reflects the server
// order/membership. ↑ is gated off the first row and ↓ off the last (an edge has
// nothing to swap with); ✕ is on every row.

async function openRoadtrip(page) {
  await enterMusic(page);
  await page.locator('.film-tile[data-id="pl-roadtrip"]').click();
  await expect(page.locator('.detail-row')).toHaveCount(2);
}

test('reorder/remove controls are edge-gated: first row has no ↑, last has no ↓, both have ✕', async ({ page }) => {
  await openRoadtrip(page);
  const first = page.locator('.detail-row[data-id="ootb-03"]'); // index 0
  const last = page.locator('.detail-row[data-id="ootb-01"]');  // index 1
  await expect(first.locator('.detail-move-up')).toHaveCount(0);
  await expect(first.locator('.detail-move-down')).toHaveCount(1);
  await expect(last.locator('.detail-move-down')).toHaveCount(0);
  await expect(last.locator('.detail-move-up')).toHaveCount(1);
  await expect(first.locator('.detail-remove')).toHaveCount(1);
  await expect(last.locator('.detail-remove')).toHaveCount(1);
});

test('moving the first track down swaps it with the next and the list reflects the new order', async ({ page }) => {
  await openRoadtrip(page);
  await page.locator('.detail-row[data-id="ootb-03"] .detail-move-down').click();
  // After the swap + reload the order is [ootb-01, ootb-03].
  await expect(page.locator('.detail-row')).toHaveCount(2);
  await expect(page.locator('.detail-row').first()).toHaveAttribute('data-id', 'ootb-01');
  await expect(page.locator('.detail-row').last()).toHaveAttribute('data-id', 'ootb-03');
});

test('moving the last track up swaps it with the previous one', async ({ page }) => {
  await openRoadtrip(page);
  await page.locator('.detail-row[data-id="ootb-01"] .detail-move-up').click();
  await expect(page.locator('.detail-row').first()).toHaveAttribute('data-id', 'ootb-01');
});

test('removing a track drops it from the playlist and the remaining track stays', async ({ page }) => {
  await openRoadtrip(page);
  await page.locator('.detail-row[data-id="ootb-01"] .detail-remove').click();
  await expect(page.locator('.detail-row')).toHaveCount(1);
  await expect(page.locator('.detail-row').first()).toHaveAttribute('data-id', 'ootb-03');
});

test('the album detail (shared screen) carries NO reorder/remove controls (playlist-only)', async ({ page }) => {
  await enterMusic(page);
  await page.locator('.rail-row[data-rail="albums"] .film-tile[data-id="ootb"]').click();
  await expect(page).toHaveURL(/album-detail\.html/);
  await expect(page.locator('.detail-row').first()).toBeVisible();
  await expect(page.locator('.detail-move-up')).toHaveCount(0);
  await expect(page.locator('.detail-move-down')).toHaveCount(0);
  await expect(page.locator('.detail-remove')).toHaveCount(0);
});
