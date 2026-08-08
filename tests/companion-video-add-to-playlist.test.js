const { test, expect } = require('@playwright/test');
const { installApi, PLAYLIST_CARDS } = require('./fixtures/api.js');

// TASK-378 — the companion mirror of the TV player's own "Add to playlist"
// sheet (screen-video-page.js / tests/video-add-to-playlist.test.js). Own small
// WS mock (mirrors companion-video-music-video.test.js): a music video has no
// video-playback engine session, so context/app_state are replayed by hand,
// carrying `itemId` — the field the sheet POSTs add-track against.

async function installMusicVideoBackend(page, opts) {
  var o = opts || {};
  var addTrackPosts = [];
  await page.route('**/api/playlists/add-track', function(route) {
    addTrackPosts.push(JSON.parse(route.request().postData()));
    route.fulfill({ status: 204, body: '' });
  });
  await page.routeWebSocket(/:8766/, function(ws) {
    ws.onMessage(function(raw) {
      var m = JSON.parse(raw);
      var REPLY = {
        list_devices: function() {
          ws.send(JSON.stringify({ type: 'devices', payload: { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] } }));
        },
        register_companion: function() {},
        snapshot_request: function() {
          ws.send(JSON.stringify({
            type: 'context',
            payload: { context_id: 'video', version: 1, display: { id: o.id, title: o.title }, musicVideo: true, musicVideoMulti: !!o.multi }
          }));
          ws.send(JSON.stringify({ type: 'app_state', payload: { person: 'kids', profile: 'kids', screen: 'player', itemId: o.id } }));
        }
      };
      [REPLY[m.type]].filter(Boolean).forEach(function(fn) { fn(); });
    });
  });
  return { addTrackPosts: addTrackPosts };
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.route('**/api/browse**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ profile: 'kids', genreLabels: {}, content: PLAYLIST_CARDS.concat([
      { kind: 'series', id: 'pl-mv', title: 'QOTSA Videos', poster: null, section: 'music-videos', collectionType: 'music-video-playlist', artist: null, clipCount: 2 }
    ]) })
  }));
});

test('the Add to playlist button shows for a music video, hidden for a film/series', async ({ page }) => {
  await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', multi: false });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await expect(page.locator('#c-add-playlist')).toBeVisible();
  // and the reverse of repeat/queue, which hide for a music video.
  await expect(page.locator('#c-repeat')).toBeHidden();
  await expect(page.locator('#c-queue')).toBeHidden();
});

test('tapping it offers only the profile\'s music-video playlists + New playlist', async ({ page }) => {
  await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', multi: false });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await page.locator('#c-add-playlist').click();
  await expect(page.locator('#add-sheet')).toBeVisible();
  await expect(page.locator('#add-sheet-list .add-choice')).toHaveText(['♪ QOTSA Videos']);
  await expect(page.locator('#btn-add-create')).toBeVisible();
});

test('picking a playlist adds the currently-playing music video and confirms', async ({ page }) => {
  const backend = await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', multi: false });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await page.locator('#c-add-playlist').click();
  await page.locator('#add-sheet-list .add-choice[data-id="pl-mv"]').click();
  await expect(page.locator('#add-status')).toHaveText('Added to QOTSA Videos');
  await expect(page.locator('#add-sheet')).toBeHidden();
  expect(backend.addTrackPosts).toEqual([{ playlist_id: 'pl-mv', track_id: 'mv-01' }]);
});

test('New playlist hands off to the companion create page carrying the video id + collectionType=music-video-playlist', async ({ page }) => {
  await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', multi: false });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await page.locator('#c-add-playlist').click();
  await page.locator('#btn-add-create').click();
  await expect(page).toHaveURL(/playlist-create\.html\?addTrack=mv-01&collectionType=music-video-playlist&profile=kids/);
});

test('Cancel closes the sheet without adding', async ({ page }) => {
  const backend = await installMusicVideoBackend(page, { id: 'mv-01', title: 'Head Like a Haunted House', multi: false });
  await page.goto('/companion/video.html');
  await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
  await page.locator('#c-add-playlist').click();
  await page.locator('#btn-add-cancel').click();
  await expect(page.locator('#add-sheet')).toBeHidden();
  expect(backend.addTrackPosts).toEqual([]);
});
