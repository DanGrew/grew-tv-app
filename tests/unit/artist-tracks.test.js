import { artistTracks } from '../../core/artist-tracks.js';

// TASK-322 (FEAT-046) — the pure artist song model: flatten the per-album detail
// records (already in artist-source order: albums newest-first, tracks in order)
// into one tagged track list the detail screen groups under album headers.
describe('artistTracks', () => {
  const time = {
    id: 'elo-time', title: 'Time',
    items: [
      { episode: 1, video: { id: 'time-01', title: 'Twilight' } },
      { episode: 2, video: { id: 'time-02', title: 'Ticket to the Moon' } }
    ]
  };
  const ootb = {
    id: 'ootb', title: 'Out of the Blue',
    items: [
      { episode: 1, video: { id: 'ootb-01', title: 'Turn to Stone' } },
      { episode: 2, video: { id: 'ootb-02', title: 'Mr. Blue Sky' } }
    ]
  };

  it('sets the model title to the artist and leaves poster null (rows use track art)', () => {
    const model = artistTracks('ELO', [time]);
    expect(model.title).toBe('ELO');
    expect(model.poster).toBe(null);
  });

  it('flattens all albums in the given order, preserving album then track order', () => {
    const model = artistTracks('ELO', [time, ootb]);
    expect(model.items.map(i => i.video.id)).toEqual(['time-01', 'time-02', 'ootb-01', 'ootb-02']);
  });

  it('reversing the album order reverses the grouping (order is caller-driven, not resorted)', () => {
    const model = artistTracks('ELO', [ootb, time]);
    expect(model.items.map(i => i.video.id)).toEqual(['ootb-01', 'ootb-02', 'time-01', 'time-02']);
  });

  it('tags each track with its owning album id + title (the header grouping key)', () => {
    const model = artistTracks('ELO', [time, ootb]);
    expect(model.items[0]).toEqual({ episode: 1, video: { id: 'time-01', title: 'Twilight' }, albumId: 'elo-time', albumTitle: 'Time' });
    expect(model.items[2].albumId).toBe('ootb');
    expect(model.items[2].albumTitle).toBe('Out of the Blue');
  });

  it('carries each track number through as episode', () => {
    const model = artistTracks('ELO', [ootb]);
    expect(model.items.map(i => i.episode)).toEqual([1, 2]);
  });

  it('skips a null album (a failed /api/album load) without dropping the rest', () => {
    const model = artistTracks('ELO', [null, ootb]);
    expect(model.items.map(i => i.video.id)).toEqual(['ootb-01', 'ootb-02']);
  });

  it('skips an album that has no items[] (no tracks contributed)', () => {
    const model = artistTracks('ELO', [{ id: 'empty', title: 'Empty' }, ootb]);
    expect(model.items.map(i => i.video.id)).toEqual(['ootb-01', 'ootb-02']);
    expect(model.items.every(i => i.albumId !== 'empty')).toBe(true);
  });

  it('a null album list yields an empty song model (no throw)', () => {
    const model = artistTracks('ELO', null);
    expect(model.items).toEqual([]);
    expect(model.title).toBe('ELO');
  });
});
