import { tileModel } from '../../core/tile-model.js';

describe('tileModel — video', () => {
  const card = { kind: 'video', id: 'ollie-car', title: 'Car', poster: 'ollie-car.jpg', durationSec: 600 };

  it('unwatched: no bar, no CC', () => {
    const m = tileModel(card, { progress: {} });
    expect(m).toMatchObject({ id: 'ollie-car', kind: 'video', title: 'Car', poster: 'ollie-car.jpg', percent: 0, showBar: false, showCC: false });
  });

  it('mid-watch: bar with percent', () => {
    const m = tileModel(card, { progress: { 'ollie-car': { resumePositionSec: 150 } } });
    expect(m.showBar).toBe(true);
    expect(m.percent).toBe(25);
  });

  it('finished: clean (no bar)', () => {
    const m = tileModel(card, { progress: { 'ollie-car': { resumePositionSec: 599 } } });
    expect(m.showBar).toBe(false);
    expect(m.percent).toBe(0);
  });
});

describe('tileModel — CC badge', () => {
  it('shows CC for a .vtt subtitles string', () => {
    expect(tileModel({ id: 'x', subtitles: 'x.vtt' }, {}).showCC).toBe(true);
  });
  it('no CC when subtitles absent', () => {
    expect(tileModel({ id: 'x' }, {}).showCC).toBe(false);
  });
  it('hasCC override wins over card inference', () => {
    expect(tileModel({ id: 'x', subtitles: 'x.vtt' }, { hasCC: false }).showCC).toBe(false);
    expect(tileModel({ id: 'x' }, { hasCC: true }).showCC).toBe(true);
  });
  it('treats a non-empty subtitles array as CC', () => {
    expect(tileModel({ id: 'x', subtitles: [{ lang: 'en' }] }, {}).showCC).toBe(true);
    expect(tileModel({ id: 'x', subtitles: [] }, {}).showCC).toBe(false);
  });
});

describe('tileModel — series', () => {
  const series = {
    kind: 'series', id: 'ollie', title: 'Ollie', poster: 'ollie.jpg',
    episodes: [{ id: 'e1', durationSec: 600 }, { id: 'e2', durationSec: 600 }]
  };

  it('no bar when no episode mid-watch', () => {
    expect(tileModel(series, { progress: {} }).showBar).toBe(false);
  });

  it('bar reflects the furthest mid-watch episode', () => {
    const m = tileModel(series, { progress: { e2: { resumePositionSec: 300 } } });
    expect(m.showBar).toBe(true);
    expect(m.percent).toBe(50);
  });
});

describe('tileModel — sub-label (clip count)', () => {
  it('series with clipCount renders "{n} clips"', () => {
    expect(tileModel({ kind: 'series', id: 's', clipCount: 6 }, {}).sub).toBe('6 clips');
  });
  it('singular clip', () => {
    expect(tileModel({ kind: 'series', id: 's', clipCount: 1 }, {}).sub).toBe('1 clip');
  });
  it('series without clipCount has no sub', () => {
    expect(tileModel({ kind: 'series', id: 's' }, {}).sub).toBeNull();
  });
  it('video cards never get a sub-label', () => {
    expect(tileModel({ kind: 'video', id: 'v', clipCount: 3 }, {}).sub).toBeNull();
  });
});

describe('tileModel — defaults', () => {
  it('defaults kind to video and title/poster safely', () => {
    const m = tileModel({ id: 'x' }, {});
    expect(m.kind).toBe('video');
    expect(m.title).toBe('');
    expect(m.poster).toBeNull();
  });
});
