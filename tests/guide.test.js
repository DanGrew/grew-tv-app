const { test, expect } = require('@playwright/test');
const {
  installApi,
  CHANNEL_ON_AIR: ON_AIR,
  CHANNEL_OFF_AIR_TIMED: OFF_AIR_TIMED,
  CHANNEL_OFF_AIR_PLAIN: OFF_AIR_PLAIN
} = require('./fixtures/api.js');
const { pickPerson } = require('./fixtures/nav.js');

// FEAT-560/TASK-590 — the Guide on the TELEVISION.
//
// The model's arithmetic is proved in tests/unit/guide.test.js and its reading of
// the real backend shape in tests/unit/contract-conformance.test.js. What this
// suite proves is the PAGE: that it is reachable from the strip, that the four
// bands are drawn, that the now line is one line across every channel, that a
// press tunes in and a listing does not, and that tomorrow is the same page with
// its first programme where the on-now card was.
//
// The strip and the listings both come from tests/fixtures/api.js, where the
// stub<->contract shape gate can see them (TASK-326). The three channels between
// them cover every state a column has: on air now, off air but back later today,
// and a channel with nothing written at all.

// ⚠️ Playwright matches the LAST-registered route first, and `**/api/channels**`
// matches a listing URL as happily as the strip's — so this override has to hand
// `/api/channels/{id}/schedule` back to installApi's own handler rather than
// answering it with a strip. Without the fallback the Guide draws three cards
// off the strip and nothing at all underneath them, which is exactly what it did
// while this was missing.
async function withChannels(page, channels) {
  await page.route('**/api/channels**', function(route) {
    const strip = new URL(route.request().url()).pathname === '/api/channels';
    return ({
      true: function() {
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ channels: channels })
        });
      },
      false: function() { return route.fallback(); }
    })[String(strip)]();
  });
}

async function openGuide(page, cards) {
  await page.goto('/app/homeview/profile.html');
  await pickPerson(page, 'kids');
  await expect(page.locator('#screen-browse')).toBeVisible();
  await page.locator('#btn-guide').click();
  await expect(page.locator('#screen-guide')).toBeVisible();
  await expect(page.locator('.guide-now')).toHaveCount(cards === undefined ? 3 : cards);
  // The day tabs only exist once a listing has answered, so waiting for them is
  // the page's own settle signal (tests/fixtures/nav.js's rule, applied here).
  await expect(page.locator('.guide-day.on')).toBeVisible();
}

function column(page, channelId) {
  return page.locator('.guide-now[data-channel="' + channelId + '"]');
}

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await withChannels(page, [ON_AIR, OFF_AIR_TIMED, OFF_AIR_PLAIN]);
});

test.describe('getting there', () => {
  // The entry point is a floating button in the bottom-right cluster, NOT a tile
  // in the strip (owner, 2026-09-08). The strip is things that are ON; a tile
  // among them that is not a channel reads as one until it is pressed.
  test('the strip holds channels and nothing else', async ({ page }) => {
    await page.goto('/app/homeview/profile.html');
    await pickPerson(page, 'kids');
    await expect(page.locator('#screen-browse')).toBeVisible();
    const tiles = page.locator('.rail-row[data-rail="channels"] .film-tile');
    await expect(tiles).toHaveCount(3);
    await expect(page.locator('.rail-row[data-rail="channels"] .film-tile[data-kind="guide"]')).toHaveCount(0);
  });

  test('the Guide button sits in the corner cluster, beside Search', async ({ page }) => {
    await page.goto('/app/homeview/profile.html');
    await pickPerson(page, 'kids');
    await expect(page.locator('#screen-browse')).toBeVisible();
    await expect(page.locator('#queue-actions #btn-guide')).toBeVisible();
    // Icon only, like Search beside it — the word lives in the aria-label.
    await expect(page.locator('#btn-guide')).toHaveText('📺');
    await expect(page.locator('#btn-guide')).toHaveAttribute('aria-label', 'Guide');
  });

  test('the button opens the Guide, and Back returns to the Channels tab', async ({ page }) => {
    await openGuide(page);
    await expect(page).toHaveURL(/guide\.html/);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/browse\.html\?.*tab=channels/);
  });

  test('the trail says where the page sits', async ({ page }) => {
    await openGuide(page);
    await expect(page.locator('.breadcrumb .crumb-link').first()).toHaveText('Home');
    await expect(page.locator('.breadcrumb .crumb-link').nth(1)).toHaveText('Channels');
    await expect(page.locator('.breadcrumb .crumb-current')).toHaveText('Guide');
  });

  // The button is tab-scoped, exactly as Play All is: over the Films tab it
  // would be furniture for a feature that tab has nothing to do with.
  test('the button is not on a tab that is not Channels', async ({ page }) => {
    await page.goto('/app/homeview/profile.html');
    await pickPerson(page, 'kids');
    await expect(page.locator('#screen-browse')).toBeVisible();
    await expect(page.locator('#btn-guide')).toBeVisible();
    await page.locator('.sidebar-tab[data-tab="films"]').focus();
    await expect(page.locator('#btn-guide')).toBeHidden();
  });

  // No channels, no Channels tab (story 6 of TASK-563) — and so no button
  // either, since the button lives on that tab.
  test('there is no Guide button with no channels', async ({ page }) => {
    await withChannels(page, []);
    await page.goto('/app/homeview/profile.html');
    await pickPerson(page, 'kids');
    await expect(page.locator('#screen-browse')).toBeVisible();
    await expect(page.locator('.sidebar-tab[data-tab="channels"]')).toHaveCount(0);
    await expect(page.locator('#btn-guide')).toBeHidden();
  });
});

test.describe('today', () => {
  // Story 1 — one column per channel, each headed with its name and its hours.
  test('every channel the profile can see gets a column', async ({ page }) => {
    await openGuide(page);
    await expect(page.locator('.guide-colhead')).toHaveCount(3);
    const heads = page.locator('.guide-chname');
    await expect(heads.nth(0)).toHaveText('Cartoon Club');
    await expect(heads.nth(1)).toHaveText('After Dark');
    await expect(heads.nth(2)).toHaveText('Matinee');
  });

  test('a head names what the channel shows and the hours it is on', async ({ page }) => {
    await openGuide(page);
    const metas = page.locator('.guide-chmeta');
    // Already running, so only its end can be known — the programme is popped
    // as it airs and this morning is not there to report.
    await expect(metas.nth(0)).toHaveText('Episodes · On air until 17:22');
    // Not on yet today, so both ends are knowable.
    await expect(metas.nth(1)).toHaveText('Films · On air 21:00–22:57');
    await expect(metas.nth(2)).toHaveText('Films · Off air');
  });

  // Story 2 — one now line, and every channel's card on one baseline under it.
  test('one now line runs across the page, naming the clock', async ({ page }) => {
    await openGuide(page);
    await expect(page.locator('#now-line')).toHaveCount(1);
    await expect(page.locator('#now-tag')).toHaveText('NOW · 17:02');
    await expect(page.locator('#now-line')).not.toHaveClass(/quiet/);
  });

  test('the on-now card is the strip\'s own — the show, the episode and the minutes', async ({ page }) => {
    await openGuide(page);
    const card = column(page, 'cartoon-club');
    await expect(card.locator('.now-tag')).toHaveText('ON NOW');
    await expect(card.locator('.now-title')).toHaveText('Bluey');
    await expect(card.locator('.now-sub')).toHaveText('Sleepytime · S1 E22');
    await expect(card.locator('.now-pos')).toHaveText('2m/8m');
  });

  // Decision 14 — the bar is the CHANNEL's position, and it ticks. 120s into
  // 480s is 25%, and it has already moved on by the time this reads it.
  test('the bar shows how far the CHANNEL has got, and moves on its own', async ({ page }) => {
    await withChannels(page, [Object.assign({}, ON_AIR, { offset_seconds: 118 })]);
    await openGuide(page, 1);
    const card = column(page, 'cartoon-club');
    await expect(card.locator('.now-pos')).toHaveText('1m/8m');
    const before = await card.locator('.now-bar-fill').getAttribute('style');
    await expect(card.locator('.now-pos')).toHaveText('2m/8m');
    expect(await card.locator('.now-bar-fill').getAttribute('style')).not.toBe(before);
    // Never the viewer's: a Guide card must not grow the library tile's bar.
    await expect(page.locator('.guide-now .tile-progress')).toHaveCount(0);
  });

  // Story 7 — off air now, back later today: the card says when.
  test('an off-air channel says so, and names when it is back', async ({ page }) => {
    await openGuide(page);
    const timed = column(page, 'after-dark');
    await expect(timed.locator('.now-tag')).toHaveText('OFF AIR');
    await expect(timed.locator('.now-title')).toHaveText('Off air');
    await expect(timed.locator('.now-pos')).toHaveText('Back at 21:00');

    const plain = column(page, 'matinee');
    await expect(plain.locator('.now-title')).toHaveText('Off air');
    await expect(plain.locator('.now-pos')).toBeHidden();
  });

  // Story 3 — under the line, each channel's own list at its own length: a
  // series and its episode, or a film and its runtime.
  test('each channel lists the rest of its own day', async ({ page }) => {
    await openGuide(page);
    const cartoon = page.locator('.guide-list').nth(0).locator('.guide-row');
    await expect(cartoon).toHaveCount(2);
    await expect(cartoon.nth(0).locator('.guide-time')).toHaveText('17:08');
    await expect(cartoon.nth(0).locator('.guide-row-title')).toHaveText('Bluey');
    await expect(cartoon.nth(0).locator('.guide-row-sub')).toHaveText('Keepy Uppy · S1 E23 · 7m');

    const dark = page.locator('.guide-list').nth(1).locator('.guide-row');
    await expect(dark).toHaveCount(1);
    await expect(dark.nth(0).locator('.guide-time')).toHaveText('21:00');
    await expect(dark.nth(0).locator('.guide-row-title')).toHaveText('Alien');
    await expect(dark.nth(0).locator('.guide-row-sub')).toHaveText('Film · 1h 57m');

    // A channel with nothing written lists nothing at all.
    await expect(page.locator('.guide-list').nth(2).locator('.guide-row')).toHaveCount(0);
  });

  // The listing never carries the programme already playing — it belongs to the
  // band above, and the two must not draw it twice.
  test('what is on now is not repeated in the list under it', async ({ page }) => {
    await openGuide(page);
    await expect(page.locator('.guide-list').nth(0).locator('.guide-row-sub').first())
      .not.toHaveText(/Sleepytime/);
  });

  // Story 4 — the day's end names the real stop and the day it is back.
  test('a column ends by naming when the channel stops and when it returns', async ({ page }) => {
    await openGuide(page);
    const tails = page.locator('.guide-tail');
    await expect(tails.nth(0)).toHaveText('Off air from 17:22 · back Monday 09:00');
    await expect(tails.nth(1)).toHaveText('Off air from 22:57 · back Monday 21:00');
    await expect(tails.nth(2)).toBeHidden();
  });
});

test.describe('pressing things', () => {
  // Story 5, first half.
  test('OK on an on-now card tunes to that channel', async ({ page }) => {
    await openGuide(page);
    await column(page, 'cartoon-club').click();
    await expect(page).toHaveURL(/video\.html\?.*channel=cartoon-club/);
  });

  // Story 5, second half — and the off-air card, which has nothing to tune to.
  test('OK on a later programme does nothing at all', async ({ page }) => {
    await openGuide(page);
    await page.locator('.guide-list').nth(0).locator('.guide-row').first().click();
    await column(page, 'after-dark').click();
    await expect(page).toHaveURL(/guide\.html/);
    await expect(page.locator('#screen-guide')).toBeVisible();
  });

  // A listing is not a control: read only, no reminders, no watch-later, no
  // recording — a channel that queues things up for you is a queue (decision 1).
  test('a listed programme is not focusable and carries no queue control', async ({ page }) => {
    await openGuide(page);
    await expect(page.locator('.guide-row [tabindex]')).toHaveCount(0);
    await expect(page.locator('.guide-row button')).toHaveCount(0);
    await expect(page.locator('.guide-list .tile-queue')).toHaveCount(0);
  });

  test('◀ ▶ move along the row of on-now cards', async ({ page }) => {
    await openGuide(page);
    await expect(column(page, 'cartoon-club')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(column(page, 'after-dark')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(column(page, 'cartoon-club')).toBeFocused();
    // The row does not wrap round its own ends.
    await page.keyboard.press('ArrowLeft');
    await expect(column(page, 'cartoon-club')).toBeFocused();
  });

  test('▲ reaches the day tabs and ▼ comes back to the cards', async ({ page }) => {
    await openGuide(page);
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.guide-day.on')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(column(page, 'cartoon-club')).toBeFocused();
  });

  // The listing has nothing to focus (a later programme is not a control), so
  // ▼ moves the PAGE — otherwise there is no way to read past the fold at all.
  test('▼ on the cards scrolls the listing, and ▲ brings it back before leaving', async ({ page }) => {
    await openGuide(page);
    const top = () => page.locator('#guide-grid').evaluate(el => el.scrollTop);
    // A viewport short enough that the columns run past the bottom.
    await page.setViewportSize({ width: 1280, height: 620 });
    await expect(column(page, 'cartoon-club')).toBeFocused();
    expect(await top()).toBe(0);
    await page.keyboard.press('ArrowDown');
    await expect.poll(top).toBeGreaterThan(0);
    // Still on the cards — ▼ moved the page, not the focus.
    await expect(column(page, 'cartoon-club')).toBeFocused();
    // ▲ scrolls back rather than jumping straight out to the tabs.
    await page.keyboard.press('ArrowUp');
    await expect.poll(top).toBe(0);
    await expect(column(page, 'cartoon-club')).toBeFocused();
    // Only once it is back at the top does ▲ leave for the day tabs.
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.guide-day.on')).toBeFocused();
  });

  test('the grid is the one thing that scrolls, and it scrolls both ways', async ({ page }) => {
    await openGuide(page);
    await expect(page.locator('#guide-grid')).toHaveCSS('overflow', 'auto');
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  });

  // Every other screen here states its controls by having them; none of them
  // prints a key legend along the bottom, so this one does not either.
  test('the page prints no key legend', async ({ page }) => {
    await openGuide(page);
    await expect(page.locator('#guide-hint')).toHaveCount(0);
    await expect(page.getByText('OK tunes in')).toHaveCount(0);
  });
});

test.describe('tomorrow', () => {
  async function openTomorrow(page) {
    await openGuide(page);
    await page.locator('.guide-day[data-day="2026-09-07"]').click();
  }

  test('the two days are named, and today leads', async ({ page }) => {
    await openGuide(page);
    const tabs = page.locator('.guide-day');
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveText('Today · Sun 6 Sep');
    await expect(tabs.nth(1)).toHaveText('Tomorrow · Mon 7 Sep');
    await expect(page.locator('.guide-day.on')).toHaveText('Today · Sun 6 Sep');
  });

  // Story 6 — the same page: the now line goes quiet, and the first programme of
  // the day stands where the on-now card was.
  test('the now line goes quiet and names the day', async ({ page }) => {
    await openTomorrow(page);
    await expect(page.locator('#now-line')).toHaveClass(/quiet/);
    await expect(page.locator('#now-tag')).toHaveText('MONDAY 7 SEP');
  });

  test("the channel's first programme stands where its on-now card was", async ({ page }) => {
    await openTomorrow(page);
    const card = column(page, 'cartoon-club');
    await expect(card.locator('.now-tag')).toHaveText('FIRST ON');
    await expect(card.locator('.now-title')).toHaveText('Bluey');
    await expect(card.locator('.now-sub')).toHaveText('The Magic Xylophone · S1 E1 · 7m');
    await expect(card.locator('.now-pos')).toHaveText('09:00');
  });

  test('the rest of the day lists under it, without repeating the first', async ({ page }) => {
    await openTomorrow(page);
    const rows = page.locator('.guide-list').nth(0).locator('.guide-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0).locator('.guide-time')).toHaveText('09:07');
    await expect(rows.nth(0).locator('.guide-row-title')).toHaveText('Paddington');
    await expect(rows.nth(0).locator('.guide-row-sub')).toHaveText('Film · 1h 35m');
  });

  test('a run that crosses midnight stays in the day it started on', async ({ page }) => {
    await openTomorrow(page);
    await expect(page.locator('.guide-chmeta').nth(0)).toHaveText('Episodes · On air 09:00–10:42');
    await expect(page.locator('.guide-tail').nth(0)).toHaveText('Off air from 10:42 · back Tuesday 09:00');
  });

  test('a channel with nothing tomorrow says only that', async ({ page }) => {
    await openTomorrow(page);
    const card = column(page, 'matinee');
    await expect(card.locator('.now-tag')).toHaveText('OFF AIR');
    await expect(card.locator('.now-title')).toHaveText('Off air');
  });

  // Nothing is on tomorrow, so nothing on that day is tunable.
  test('pressing tomorrow\'s first programme does nothing', async ({ page }) => {
    await openTomorrow(page);
    await column(page, 'cartoon-club').click();
    await expect(page).toHaveURL(/guide\.html/);
  });

  test('coming back to Today restores the live line', async ({ page }) => {
    await openTomorrow(page);
    await page.locator('.guide-day[data-day="2026-09-06"]').click();
    await expect(page.locator('#now-tag')).toHaveText('NOW · 17:02');
    await expect(column(page, 'cartoon-club').locator('.now-tag')).toHaveText('ON NOW');
  });
});
