import { describe, it, expect } from 'vitest';
import { buildCrumbs, breadcrumbHtml, trailCrumbs, playerCrumbs } from '../../core/breadcrumb.js';

describe('buildCrumbs', () => {
  it('browse is a single non-clickable Home leaf', () => {
    var crumbs = buildCrumbs('browse');
    expect(crumbs).toHaveLength(1);
    expect(crumbs[0]).toMatchObject({ label: 'Home', current: true });
  });

  it('detail is Home (clickable) then the series leaf', () => {
    var crumbs = buildCrumbs('detail', { seriesId: 'bluey', seriesTitle: 'Bluey' });
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0]).toMatchObject({ label: 'Home', page: 'browse.html', current: false });
    expect(crumbs[1]).toMatchObject({ label: 'Bluey', current: true });
  });

  it('series video is Home > Series (clickable) > Episode leaf', () => {
    var crumbs = buildCrumbs('video', { seriesId: 'bluey', seriesTitle: 'Bluey', videoTitle: 'Hammerbarn' });
    expect(crumbs).toHaveLength(3);
    expect(crumbs[1]).toMatchObject({ label: 'Bluey', page: 'detail.html', params: { series: 'bluey' }, current: false });
    expect(crumbs[2]).toMatchObject({ label: 'Hammerbarn', current: true });
  });

  it('film video (no series) is Home > Film leaf', () => {
    var crumbs = buildCrumbs('video', { videoTitle: 'Toy Story' });
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0].current).toBe(false);
    expect(crumbs[1]).toMatchObject({ label: 'Toy Story', current: true });
  });

  it('rail-grid is Home > Section (clickable, ?tab=) > Rail leaf (FEAT-028)', () => {
    var crumbs = buildCrumbs('rail-grid', { sectionId: 'series', sectionTitle: 'TV Series', railTitle: 'Preschool' });
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]).toMatchObject({ label: 'Home', page: 'browse.html', current: false });
    expect(crumbs[1]).toMatchObject({ label: 'TV Series', page: 'browse.html', params: { tab: 'series' }, current: false });
    expect(crumbs[2]).toMatchObject({ label: 'Preschool', current: true });
  });

  it('artist is Home > Music (clickable, ?tab=music) > Artist leaf (FEAT-029)', () => {
    var crumbs = buildCrumbs('artist', { artistName: 'ELO' });
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]).toMatchObject({ label: 'Home', page: 'browse.html', current: false });
    expect(crumbs[1]).toMatchObject({ label: 'Music', page: 'browse.html', params: { tab: 'music' }, current: false });
    expect(crumbs[2]).toMatchObject({ label: 'ELO', current: true });
  });

  it('unknown screen yields an empty trail', () => {
    expect(buildCrumbs('mystery')).toEqual([]);
  });
});

describe('breadcrumbHtml', () => {
  it('renders a clickable crumb as a button carrying its nav target', () => {
    var html = breadcrumbHtml(buildCrumbs('detail', { seriesId: 'bluey', seriesTitle: 'Bluey' }));
    expect(html).toContain('class="crumb crumb-link" id="crumb-0"');
    expect(html).toContain('data-page="browse.html"');
    expect(html).toContain("data-params='{}'");
  });

  it('renders the current crumb as an inert span', () => {
    var html = breadcrumbHtml(buildCrumbs('detail', { seriesId: 'bluey', seriesTitle: 'Bluey' }));
    expect(html).toContain('<span class="crumb crumb-current">Bluey</span>');
  });

  it('serialises clickable params as JSON in the data attribute', () => {
    var html = breadcrumbHtml(buildCrumbs('video', { seriesId: 'bluey', seriesTitle: 'Bluey', videoTitle: 'Ep' }));
    expect(html).toContain('data-params=\'{"series":"bluey"}\'');
  });

  it('escapes HTML in crumb labels', () => {
    var html = breadcrumbHtml(buildCrumbs('detail', { seriesId: 'x', seriesTitle: 'Tom & <Jerry>' }));
    expect(html).toContain('Tom &amp; &lt;Jerry&gt;');
    expect(html).not.toContain('<Jerry>');
  });

  it('escapes double-quotes and apostrophes in labels too', () => {
    var html = breadcrumbHtml(buildCrumbs('detail', { seriesId: 'x', seriesTitle: 'O\'Neil "Best"' }));
    expect(html).toContain('O&#39;Neil &quot;Best&quot;');
  });

  it('wraps the crumbs in a <nav> and joins them with the › separator', () => {
    // Two crumbs (clickable Home + current leaf) exercise the nav wrapper, the
    // </button> close, and the join separator between crumbs.
    var html = breadcrumbHtml(buildCrumbs('detail', { seriesId: 'bluey', seriesTitle: 'Bluey' }));
    expect(html).toContain('<nav class="breadcrumb" aria-label="Breadcrumb">');
    expect(html).toContain('</nav>');
    expect(html).toContain('</button>');
    expect(html).toContain('<span class="crumb-sep" aria-hidden="true">›</span>');
  });
});

describe('trailCrumbs (FEAT-032 companion player breadcrumb)', () => {
  it('no recorded entry -> Home (clickable) then the leaf, nothing in between', () => {
    var crumbs = trailCrumbs(null, 'Some Song');
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0]).toMatchObject({ label: 'Home', page: 'browse.html', current: false });
    expect(crumbs[1]).toMatchObject({ label: 'Some Song', current: true });
  });

  it('a recorded entry becomes a clickable items crumb between Home and the leaf', () => {
    var entry = { label: 'Albums', page: 'browse.html', params: { tab: 'music', rail: 'albums' } };
    var crumbs = trailCrumbs(entry, 'Some Song');
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]).toMatchObject({ label: 'Home', page: 'browse.html', current: false });
    expect(crumbs[1]).toMatchObject({ label: 'Albums', page: 'browse.html', params: { tab: 'music', rail: 'albums' }, current: false });
    expect(crumbs[2]).toMatchObject({ label: 'Some Song', current: true });
  });

  it('the Home crumb carries empty params (so the player can detect it and clear the trail)', () => {
    var entry = { label: 'Albums', page: 'browse.html', params: { tab: 'music' } };
    var crumbs = trailCrumbs(entry, 'X');
    expect(crumbs[0].params).toEqual({});
    expect(crumbs[1].params.tab).toBe('music');
  });
});

describe('playerCrumbs (BUG-044 audio player source crumb)', () => {
  var SOURCE = { label: 'Out of the Blue', page: 'album-detail.html', params: { album: 'ootb' } };

  it('inserts the source AFTER the recorded browse rail, before the now-playing leaf', () => {
    var entry = { label: 'Albums', page: 'browse.html', params: { tab: 'music' } };
    var crumbs = playerCrumbs(entry, SOURCE, 'Mr. Blue Sky');
    expect(crumbs).toHaveLength(4);
    expect(crumbs[0]).toMatchObject({ label: 'Home', page: 'browse.html', current: false });
    expect(crumbs[1]).toMatchObject({ label: 'Albums', page: 'browse.html', params: { tab: 'music' }, current: false });
    // The source sits between the rail and the leaf — clickable, links to its page.
    expect(crumbs[2]).toMatchObject({ label: 'Out of the Blue', page: 'album-detail.html', params: { album: 'ootb' }, current: false });
    expect(crumbs[3]).toMatchObject({ label: 'Mr. Blue Sky', page: null, current: true });
  });

  it('with no recorded browse rail falls back to Home > Source > leaf (deep-link)', () => {
    var crumbs = playerCrumbs(null, SOURCE, 'Mr. Blue Sky');
    expect(crumbs).toHaveLength(3);
    expect(crumbs[0]).toMatchObject({ label: 'Home', page: 'browse.html', current: false });
    expect(crumbs[1]).toMatchObject({ label: 'Out of the Blue', page: 'album-detail.html', params: { album: 'ootb' }, current: false });
    expect(crumbs[2]).toMatchObject({ label: 'Mr. Blue Sky', current: true });
  });

  it('a null source (a lone single track — no source page) degrades to the plain browse-trail crumbs', () => {
    var entry = { label: 'Albums', page: 'browse.html', params: { tab: 'music' } };
    expect(playerCrumbs(entry, null, 'Some Single')).toEqual(trailCrumbs(entry, 'Some Single'));
    expect(playerCrumbs(null, null, 'Some Single')).toEqual(trailCrumbs(null, 'Some Single'));
  });

  it('carries the source page/params through verbatim (so the crumb returns to the source itself)', () => {
    var src = { label: 'Road Trip', page: 'playlist-detail.html', params: { playlist: 'pl-roadtrip' } };
    var crumbs = playerCrumbs(null, src, 'Turn to Stone');
    expect(crumbs[1].page).toBe('playlist-detail.html');
    expect(crumbs[1].params).toEqual({ playlist: 'pl-roadtrip' });
    expect(crumbs[1].current).toBe(false);
  });
});
