import { coverMosaicHtml } from '../../core/cover-mosaic.js';

function imgCount(html) {
  return (html.match(/<img/g) || []).length;
}

describe('coverMosaicHtml — degrade by count', () => {
  it('0 refs -> empty string (caller falls back to placeholder)', () => {
    expect(coverMosaicHtml([])).toBe('');
    expect(coverMosaicHtml(undefined)).toBe('');
  });

  it('1 ref -> single full-bleed, one column/row', () => {
    const h = coverMosaicHtml(['a.jpg']);
    expect(imgCount(h)).toBe(1);
    expect(h).toContain('grid-template-columns:1fr');
    expect(h).toContain('grid-template-rows:1fr');
    expect(h).not.toContain('grid-column:1/3');
  });

  it('2 refs -> two halves, side by side', () => {
    const h = coverMosaicHtml(['a.jpg', 'b.jpg']);
    expect(imgCount(h)).toBe(2);
    expect(h).toContain('grid-template-columns:1fr 1fr');
    expect(h).toContain('grid-template-rows:1fr');
    expect(h).not.toContain('grid-column:1/3');
  });

  it('3 refs -> 2-over-1, third cell spans the bottom row', () => {
    const h = coverMosaicHtml(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(imgCount(h)).toBe(3);
    expect(h).toContain('grid-template-columns:1fr 1fr');
    expect(h).toContain('grid-template-rows:1fr 1fr');
    expect((h.match(/grid-column:1\/3/g) || []).length).toBe(1);
  });

  it('4 refs -> full 2x2, no spanning cell', () => {
    const h = coverMosaicHtml(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
    expect(imgCount(h)).toBe(4);
    expect(h).toContain('grid-template-columns:1fr 1fr');
    expect(h).toContain('grid-template-rows:1fr 1fr');
    expect(h).not.toContain('grid-column:1/3');
  });

  it('caps at 4 when given more', () => {
    expect(imgCount(coverMosaicHtml(['a', 'b', 'c', 'd', 'e', 'f']))).toBe(4);
  });

  it('keeps art order and escapes the url', () => {
    const h = coverMosaicHtml(['1.jpg', '2.jpg']);
    expect(h.indexOf('1.jpg')).toBeLessThan(h.indexOf('2.jpg'));
    expect(coverMosaicHtml(['a"><x'])).toContain('a&quot;&gt;&lt;x');
  });
});
