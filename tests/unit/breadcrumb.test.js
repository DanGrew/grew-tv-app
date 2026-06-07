import { describe, it, expect } from 'vitest';
import { buildCrumbs, breadcrumbHtml } from '../../core/breadcrumb.js';

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
});
