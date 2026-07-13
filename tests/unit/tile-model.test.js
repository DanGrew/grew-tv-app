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
  it('a non-.vtt subtitles string is NOT CC (the string branch tests the extension)', () => {
    // Guards the `typeof s === 'string'` branch: without it a bare string would
    // fall through to the truthy default and wrongly show CC.
    expect(tileModel({ id: 'x', subtitles: 'notes.srt' }, {}).showCC).toBe(false);
  });
  it('the .vtt match is anchored to the end (a .vtt mid-name is not CC)', () => {
    expect(tileModel({ id: 'x', subtitles: 'x.vtt.bak' }, {}).showCC).toBe(false);
  });
  it('treats a non-empty subtitles array as CC', () => {
    expect(tileModel({ id: 'x', subtitles: [{ lang: 'en' }] }, {}).showCC).toBe(true);
    expect(tileModel({ id: 'x', subtitles: [] }, {}).showCC).toBe(false);
  });
  it('treats a truthy non-string, non-array subtitles value as CC (present)', () => {
    // e.g. a bare truthy flag / object from an older backend -> assume subtitles exist
    expect(tileModel({ id: 'x', subtitles: true }, {}).showCC).toBe(true);
    expect(tileModel({ id: 'x', subtitles: { en: 'x.vtt' } }, {}).showCC).toBe(true);
  });
});

describe('tileModel — Lyrics badge (music)', () => {
  it('shows Lyrics for a music card with hasLyrics', () => {
    expect(tileModel({ kind: 'series', id: 'ootb', section: 'music', hasLyrics: true }, {}).showLyrics).toBe(true);
  });
  it('no Lyrics for a music card without hasLyrics', () => {
    expect(tileModel({ kind: 'series', id: 'ootb', section: 'music' }, {}).showLyrics).toBe(false);
  });
  it('never on a non-music card even if hasLyrics is set', () => {
    expect(tileModel({ kind: 'series', id: 'bluey', section: 'series', hasLyrics: true }, {}).showLyrics).toBe(false);
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

describe('tileModel — music (FEAT-027)', () => {
  it('flags a music card by section and counts in "tracks"', () => {
    const m = tileModel({ kind: 'series', id: 'ootb', section: 'music', clipCount: 3 }, {});
    expect(m.music).toBe(true);
    expect(m.sub).toBe('3 tracks');
  });

  it('singular track', () => {
    expect(tileModel({ kind: 'series', id: 's', section: 'music', clipCount: 1 }, {}).sub).toBe('1 track');
  });

  it('an explicit subLabel wins over clipCount (FEAT-029 artist tile carries "N albums")', () => {
    const artist = tileModel({ kind: 'artist', id: 'artist:ELO', section: 'music', subLabel: '2 albums' }, {});
    expect(artist.sub).toBe('2 albums');
    expect(artist.music).toBe(true); // square art, like an album tile
    expect(artist.showBar).toBe(false); // an artist tile is never mid-watch
    // subLabel also overrides a clipCount if both are present.
    expect(tileModel({ kind: 'series', id: 's', section: 'music', clipCount: 3, subLabel: '5 albums' }, {}).sub).toBe('5 albums');
  });

  it('a non-music section is not flagged music (counts in "clips")', () => {
    const m = tileModel({ kind: 'series', id: 'bluey', section: 'series', clipCount: 3 }, {});
    expect(m.music).toBe(false);
    expect(m.sub).toBe('3 clips');
  });

  it('routes on section only — the old format/mediaType enum no longer flags music', () => {
    // Fails on the pre-163 code, which read format:"album" / mediaType:"audio".
    expect(tileModel({ kind: 'series', id: 'x', format: 'album', clipCount: 2 }, {}).music).toBe(false);
    expect(tileModel({ kind: 'video', id: 'y', mediaType: 'audio' }, {}).music).toBe(false);
  });
});

describe('tileModel — defaults', () => {
  it('defaults kind to video and title/poster safely', () => {
    const m = tileModel({ id: 'x' }, {});
    expect(m.kind).toBe('video');
    expect(m.title).toBe('');
    expect(m.poster).toBeNull();
  });
  it('tolerates an omitted ctx (no progress context)', () => {
    const m = tileModel({ id: 'x' });
    expect(m.showBar).toBe(false);
    expect(m.percent).toBe(0);
  });
});

describe('tileModel — cover mosaic (FEAT-039)', () => {
  it('passes through a coverArt array for a playlist tile', () => {
    const m = tileModel({ kind: 'series', id: 'pl', section: 'music', coverArt: ['a.jpg', 'b.jpg'] }, {});
    expect(m.coverArt).toEqual(['a.jpg', 'b.jpg']);
  });
  it('defaults to [] when coverArt is absent or not an array', () => {
    expect(tileModel({ id: 'x' }, {}).coverArt).toEqual([]);
    expect(tileModel({ id: 'x', coverArt: 'nope' }, {}).coverArt).toEqual([]);
  });
});
