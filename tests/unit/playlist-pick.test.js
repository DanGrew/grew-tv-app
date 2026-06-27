import { playlistCards } from '../../core/playlist-pick.js';

describe('playlistCards', () => {
  it('keeps only collectionType:playlist cards, reduced to {id,title}', () => {
    var content = [
      { kind: 'series', id: 'ootb', title: 'Out of the Blue', section: 'music', collectionType: undefined },
      { kind: 'series', id: 'pl-roadtrip', title: 'Road Trip', section: 'music', collectionType: 'playlist', clipCount: 2 },
      { kind: 'series', id: 'pl-empty', title: 'Empty Mix', section: 'music', collectionType: 'playlist', clipCount: 0 }
    ];
    expect(playlistCards(content)).toEqual([
      { id: 'pl-roadtrip', title: 'Road Trip' },
      { id: 'pl-empty', title: 'Empty Mix' }
    ]);
  });

  it('preserves the backend order (an empty playlist is still offered)', () => {
    var content = [
      { id: 'pl-b', title: 'B', collectionType: 'playlist' },
      { id: 'pl-a', title: 'A', collectionType: 'playlist' }
    ];
    expect(playlistCards(content).map(function(c) { return c.id; })).toEqual(['pl-b', 'pl-a']);
  });

  it('returns [] for browse with no playlists', () => {
    expect(playlistCards([{ id: 'ootb', collectionType: undefined }])).toEqual([]);
  });

  it('tolerates a null/absent content list', () => {
    expect(playlistCards(null)).toEqual([]);
    expect(playlistCards(undefined)).toEqual([]);
  });

  it('excludes the given id (TASK-212 — a playlist cannot be added into itself)', () => {
    var content = [
      { id: 'pl-self', title: 'Self', collectionType: 'playlist' },
      { id: 'pl-other', title: 'Other', collectionType: 'playlist' }
    ];
    expect(playlistCards(content, 'pl-self')).toEqual([{ id: 'pl-other', title: 'Other' }]);
  });

  it('keeps every playlist when excludeId is omitted/undefined', () => {
    var content = [
      { id: 'pl-a', title: 'A', collectionType: 'playlist' },
      { id: 'pl-b', title: 'B', collectionType: 'playlist' }
    ];
    expect(playlistCards(content).map(function(c) { return c.id; })).toEqual(['pl-a', 'pl-b']);
  });
});
