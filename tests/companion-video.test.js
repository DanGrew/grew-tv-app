const { test, expect } = require('@playwright/test');
const { installApi, installQueuePlaybackBackend } = require('./fixtures/api.js');

// FEAT-037 (TASK-223) — companion VIDEO page: the surrounding chrome (Quick
// Pause, the BUG-045 enabled/disabled look, the BUG-037/TASK-422 breadcrumb
// retrace) that doesn't depend on which per-person engine is live. TASK-503
// moved the Plane-B now-playing/prev/next/repeat/shuffle coverage for a
// series/single film to its own tests/companion-video-film.test.js (the
// TASK-499 home-movie precedent, companion-video-home-movie.test.js) — this
// page's title/pills now ride the TV's own `context` push for film mode, not
// a queue_playback snapshot read directly here, so those tests need their own
// dedicated fixture (see that file's header).

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await installQueuePlaybackBackend(page, 'film');
  await page.goto('/companion/video.html');
  await expect(page.locator('#c-queue')).toBeVisible();
});

// TASK-488 — the film companion's own Quick Pause link, mirroring audio.html's.
test('Quick Pause marks the source as video and links to the disconnected page', async ({ page }) => {
  await page.locator('#c-quickpause').click();
  await expect(page).toHaveURL(/quick-pause\.html/);
  expect(await page.evaluate(() => localStorage.getItem('grew-tv-quickpause-source'))).toBe('video');
});

// TASK-415 — the popout menu's Switch profile, ported from companion-browse.js.
// The module beforeEach's playback-backend socket doesn't echo `navigate`, so
// this re-registers a minimal recorder and re-navigates for its own connection.
test('Switch profile sends the navigate intent to the picker (BUG-007)', async ({ page }) => {
  const intents = [];
  await page.routeWebSocket(/:8766/, ws => {
    ws.onMessage(raw => {
      const m = JSON.parse(raw);
      if (m.type === 'intent') intents.push(m.payload);
    });
  });
  await page.goto('/companion/video.html');
  await page.locator('#btn-status').click();
  await page.locator('#switch-profile').click();
  await expect.poll(() => intents.filter(i => i.intent === 'navigate' && i.params.page === 'profile.html').length).toBeGreaterThan(0);
});

// BUG-045 — the Queue and Reset buttons are live, full-opacity, clickable controls, but
// their `.reset-btn` resting style painted the label in `var(--text-muted)` — the same
// muted look the page uses for genuinely-disabled controls (`opacity:0.35`). An enabled
// control read as dead. The fix repaints the resting label in `var(--text)`, so an
// enabled button is visibly distinct from the disabled treatment. These guards fail on
// the old muted style and prove the disabled path still LOOKS disabled.
test.describe('BUG-045: the enabled Queue/Reset buttons look enabled, not disabled', () => {
  // Resolve the theme tokens through a probe so the assertion tracks the CSS variables,
  // not a hardcoded rgb string the browser might normalise differently.
  function resolveTokens(page) {
    return page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      probe.style.color = root.getPropertyValue('--text').trim();
      const text = getComputedStyle(probe).color;
      probe.style.color = root.getPropertyValue('--text-muted').trim();
      const muted = getComputedStyle(probe).color;
      probe.remove();
      return { text, muted };
    });
  }

  test('resting Queue and Reset labels use --text (not the muted/disabled colour) at full opacity', async ({ page }) => {
    const tokens = await resolveTokens(page);
    // sanity: the two tokens really are different, so the assertion below has teeth.
    expect(tokens.text).not.toBe(tokens.muted);
    const queue = page.locator('#c-queue');
    const reset = page.locator('#c-reset');
    const queueColor = await queue.evaluate((el) => getComputedStyle(el).color);
    const resetColor = await reset.evaluate((el) => getComputedStyle(el).color);
    expect(queueColor).toBe(tokens.text);
    expect(resetColor).toBe(tokens.text);
    expect(queueColor).not.toBe(tokens.muted);
    expect(resetColor).not.toBe(tokens.muted);
    // enabled = full opacity + clickable, unlike the opacity:0.35;pointer-events:none disabled look.
    await expect(queue).toHaveCSS('opacity', '1');
    await expect(reset).toHaveCSS('opacity', '1');
    await expect(queue).toHaveCSS('pointer-events', 'auto');
    await expect(reset).toHaveCSS('pointer-events', 'auto');
  });

  test('a genuinely-disabled Reset (browsing mode) still LOOKS disabled', async ({ page }) => {
    await page.evaluate(() => document.body.classList.add('browsing'));
    const reset = page.locator('#c-reset');
    // the disabled treatment is unchanged: greyed out + non-interactive.
    await expect(reset).toHaveCSS('opacity', '0.35');
    await expect(reset).toHaveCSS('pointer-events', 'none');
  });

  test('the Reset confirm style stays amber (distinct from both enabled and disabled)', async ({ page }) => {
    const tokens = await resolveTokens(page);
    // Read the .reset-btn.confirm rule off a synthetic probe — the live #c-reset has its
    // confirm class toggled by the page's reset state machine, so probe the rule directly.
    const confirmColor = await page.evaluate(() => {
      const probe = document.createElement('button');
      probe.className = 'reset-btn confirm';
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    // confirm is its own amber affordance — neither the enabled --text nor muted.
    expect(confirmColor).not.toBe(tokens.text);
    expect(confirmColor).not.toBe(tokens.muted);
  });
});

// BUG-037 — the Plane-A breadcrumb (a standalone film has no video_playback engine
// source, so its title + context arrive over the legacy WS intent rail, not a
// snapshot). Before the fix the film player collapsed to `Home › Title` (the only
// way back was Home), losing the genre grid the film was reached through. It now
// mirrors companion-artist's FEAT-032 nav-trail retrace: a film reached via a genre
// grid reads `Home › <grid> › Title` and steps back to that grid. A series episode
// (has a seriesId) is untouched — it keeps `Home › Series › Episode`.
test.describe('BUG-037: film player breadcrumb retraces to the genre grid', () => {
  function msg(type, payload) { return JSON.stringify({ type, payload }); }

  // Drive the player over the WS the way the app does for a standalone film: push a
  // `video` context carrying the display title, plus an app_state whose itemId ===
  // episodeId (seriesIdFromSnap -> undefined -> film) or itemId !== episodeId (a
  // series episode). Registered AFTER the fixture routes so it wins (most-recent).
  function mockPlayer(page, appState, title) {
    return page.routeWebSocket(/:8766/, (ws) => {
      function push() {
        ws.send(msg('context', { version: 2, context_id: 'video', display: { title } }));
        ws.send(msg('app_state', appState));
      }
      ws.onMessage((raw) => {
        const m = JSON.parse(raw);
        if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
        if (m.type === 'snapshot_request') push();
        // A crumb tap sends `navigate`; the TV teleports and echoes the new context,
        // which the companion follows to that page.
        if (m.type === 'intent' && m.payload.intent === 'navigate') {
          ws.send(msg('context', { version: 3, context_id: m.payload.params.page.replace('.html', '') }));
        }
      });
    });
  }

  const FILM_STATE = { person: 'kids', profile: 'kids', screen: 'player', itemId: 'toy-story-main', episodeId: 'toy-story-main' };
  const SERIES_STATE = { person: 'kids', profile: 'kids', screen: 'player', itemId: 'bluey', episodeId: 'bluey-s1e01' };

  function seedGridTrail(page) {
    return page.addInitScript(() => {
      sessionStorage.setItem('grew-tv:nav-trail', JSON.stringify([
        { page: 'browse.html', params: { tab: 'films', rail: 'animation' }, label: 'Animation' }
      ]));
    });
  }

  test('a film reached via a genre grid shows Home › Grid › Title (3 crumbs) that retrace to the grid', async ({ page }) => {
    await seedGridTrail(page);
    await mockPlayer(page, FILM_STATE, 'Toy Story');
    await page.goto('/companion/video.html');
    await expect(page.locator('#now-title')).toHaveText('Toy Story');
    // 3 crumbs: Home, the genre grid, the (inert) film title.
    await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'Animation', 'Toy Story']);
    await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home', 'Animation']);
    const grid = page.locator('#breadcrumb .crumb-link', { hasText: 'Animation' });
    await expect(grid).toHaveAttribute('data-page', 'browse.html');
    await expect(grid).toHaveAttribute('data-params', /"rail":"animation"/);
    // tapping the grid crumb teleports the TV back to the grid; the companion follows.
    await grid.click();
    await expect(page).toHaveURL(/companion\/browse\.html$/);
  });

  test('a deep-linked film (no browse trail) falls back to Home › Title', async ({ page }) => {
    await mockPlayer(page, FILM_STATE, 'Toy Story');
    await page.goto('/companion/video.html');
    await expect(page.locator('#now-title')).toHaveText('Toy Story');
    await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'Toy Story']);
    await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home']);
  });

  test('a series episode is unchanged — Home › Series › Episode (guards no regression)', async ({ page }) => {
    await seedGridTrail(page);
    await mockPlayer(page, SERIES_STATE, 'Daddy Putdown');
    await page.goto('/companion/video.html');
    await expect(page.locator('#now-title')).toHaveText('Daddy Putdown');
    await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'Bluey', 'Daddy Putdown']);
    const series = page.locator('#breadcrumb .crumb-link', { hasText: 'Bluey' });
    await expect(series).toHaveAttribute('data-page', 'detail.html');
    await expect(series).toHaveAttribute('data-params', /"series":"bluey"/);
  });
});

// TASK-422 — the companion mirrors the TV's music-video source crumb. A music
// video never broadcasts a video_playback snapshot, so the source rides the
// SAME `video` context push BUG-037's own mockPlayer already drives —
// screen-video-page.js's sendVideoContext carries musicVideoSource, captured
// into state.crumb.mvSource here (onVideoContext).
test.describe('TASK-422: music-video player breadcrumb names its playback source', () => {
  function msg(type, payload) { return JSON.stringify({ type, payload }); }

  function mockMvPlayer(page, source, title) {
    return page.routeWebSocket(/:8766/, (ws) => {
      function push() {
        ws.send(msg('context', {
          version: 2, context_id: 'video', display: { title },
          musicVideo: true, musicVideoShuffle: true, musicVideoRepeat: true,
          musicVideoTransport: { previous: !!source, next: !!source, shuffle: !!source, repeat: !!source },
          musicVideoSource: source
        }));
        ws.send(msg('app_state', { person: 'kids', profile: 'kids', screen: 'player', itemId: 'mv-01', episodeId: 'mv-01' }));
      }
      ws.onMessage((raw) => {
        const m = JSON.parse(raw);
        if (m.type === 'list_devices') ws.send(msg('devices', { devices: [{ device_id: 'tv', label: 'TV', active_person: null }] }));
        if (m.type === 'snapshot_request') push();
        if (m.type === 'intent' && m.payload.intent === 'navigate') {
          ws.send(msg('context', { version: 3, context_id: m.payload.params.page.replace('.html', '') }));
        }
      });
    });
  }

  test('a music video played from a playlist shows Home › [Playlist] › [Video], mirroring the TV', async ({ page }) => {
    await mockMvPlayer(page, { label: 'QOTSA Videos', page: 'playlist-detail.html', params: { playlist: 'pl-mv' } }, 'Head Like a Haunted House');
    await page.goto('/companion/video.html');
    await expect(page.locator('#now-title')).toHaveText('Head Like a Haunted House');
    await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'QOTSA Videos', 'Head Like a Haunted House']);
    const src = page.locator('#breadcrumb .crumb-link', { hasText: 'QOTSA Videos' });
    await expect(src).toHaveAttribute('data-page', 'playlist-detail.html');
    await expect(src).toHaveAttribute('data-params', /"playlist":"pl-mv"/);
  });

  test('a music video played from an artist\'s rail shows Home › [Artist] › [Video]', async ({ page }) => {
    await mockMvPlayer(page, { label: 'QOTSA', page: 'artist.html', params: { artist: 'QOTSA' } }, 'Head Like a Haunted House');
    await page.goto('/companion/video.html');
    await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'QOTSA', 'Head Like a Haunted House']);
    const src = page.locator('#breadcrumb .crumb-link', { hasText: 'QOTSA' });
    await expect(src).toHaveAttribute('data-page', 'artist.html');
  });

  test('a standalone music-video pick has no source crumb — Home › [Video] only (story 4)', async ({ page }) => {
    await mockMvPlayer(page, null, 'Head Like a Haunted House');
    await page.goto('/companion/video.html');
    await expect(page.locator('#breadcrumb .crumb')).toHaveText(['Home', 'Head Like a Haunted House']);
    await expect(page.locator('#breadcrumb .crumb-link')).toHaveText(['Home']);
  });

  // Browse (desynced) mode: the source crumb carries the TV page name
  // (playlist-detail.html); the companion translates it to its own
  // playlist.html?id= so the local hop lands (BUG-044's own LOCAL_PAGE pattern).
  test('in Browse mode the playlist source crumb hops to the companion\'s own playlist page', async ({ page }) => {
    await mockMvPlayer(page, { label: 'QOTSA Videos', page: 'playlist-detail.html', params: { playlist: 'pl-mv' } }, 'Head Like a Haunted House');
    await page.goto('/companion/video.html');
    await expect(page.locator('#breadcrumb .crumb-link', { hasText: 'QOTSA Videos' })).toBeVisible();
    await page.locator('#btn-status').click();
    await page.locator('.seg-opt').filter({ hasText: 'Browse' }).click();
    await expect(page.locator('body')).toHaveClass(/browsing/);
    await page.locator('#breadcrumb .crumb-link', { hasText: 'QOTSA Videos' }).click();
    await expect(page).toHaveURL(/companion\/playlist\.html\?id=pl-mv$/);
  });
});
