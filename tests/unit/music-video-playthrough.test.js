import { describe, it, expect } from 'vitest';
import { entryMode, playlistTrackTarget, playlistQueueKey, mvTransportVisibility } from '../../core/music-video-playthrough.js';

describe('entryMode', () => {
  it('is "queue" when a video Play Queue is requested, over everything else', () => {
    expect(entryMode({ playQueue: true, mvPlaylist: 'pl1', mvArtist: 'ELO', mvItem: 'mv1', isSeries: true })).toBe('queue');
  });
  it('is "mvPlaylist" when a music-video playlist id is given', () => {
    expect(entryMode({ mvPlaylist: 'pl1' })).toBe('mvPlaylist');
  });
  it('is "mvArtist" when a music-video artist is given (and no playlist)', () => {
    expect(entryMode({ mvArtist: 'ELO' })).toBe('mvArtist');
    expect(entryMode({ mvPlaylist: 'pl1', mvArtist: 'ELO' })).toBe('mvPlaylist');
  });
  it('is "mvItem" when a lone music video id is given (and no playlist/artist)', () => {
    expect(entryMode({ mvItem: 'mv1' })).toBe('mvItem');
    expect(entryMode({ mvArtist: 'ELO', mvItem: 'mv1' })).toBe('mvArtist');
  });
  it('is "mvAll" when Play All is requested (and no playlist/artist/item)', () => {
    expect(entryMode({ mvAll: true })).toBe('mvAll');
    expect(entryMode({ mvItem: 'mv1', mvAll: true })).toBe('mvItem');
  });
  it('is "homeMoviesAll" when the TASK-446 Home Movies Play All is requested (and no mv* param)', () => {
    expect(entryMode({ homeMoviesAll: true })).toBe('homeMoviesAll');
    expect(entryMode({ mvAll: true, homeMoviesAll: true })).toBe('mvAll');
  });
  it('is "series" when a series id is flagged (and no music-video/home-movies param)', () => {
    expect(entryMode({ isSeries: true })).toBe('series');
    expect(entryMode({ mvItem: 'mv1', isSeries: true })).toBe('mvItem');
    expect(entryMode({ mvAll: true, isSeries: true })).toBe('mvAll');
    expect(entryMode({ homeMoviesAll: true, isSeries: true })).toBe('homeMoviesAll');
  });
  it('is "single" for a standalone film — the default with nothing set', () => {
    expect(entryMode({})).toBe('single');
    expect(entryMode(undefined)).toBe('single');
  });
});

describe('playlistTrackTarget', () => {
  var audioTarget = { page: 'audio.html', params: { playlist: 'pl-1', track: 'trk-1', from: 'detail-playlist' } };

  it('sends a music-video item to the video player, not the audio target', () => {
    var item = { video: { id: 'mv-1', itemType: 'music-video' } };
    expect(playlistTrackTarget(item, 'pl-1', audioTarget)).toEqual({
      page: 'video.html',
      params: { musicVideoPlaylist: 'pl-1', musicVideoTrack: 'mv-1', from: 'detail-playlist' }
    });
  });

  it('passes a track item straight through to the given audio target unchanged', () => {
    var item = { video: { id: 'trk-1', itemType: 'track' } };
    expect(playlistTrackTarget(item, 'pl-1', audioTarget)).toBe(audioTarget);
  });
});

describe('playlistQueueKey (TASK-421)', () => {
  it('is "music-video" for a music-video item — routes Play Next to its OWN engine', () => {
    expect(playlistQueueKey('music-video')).toBe('music-video');
  });
  it('is "track" for a plain audio track (itemType absent) — routes to the audio engine', () => {
    expect(playlistQueueKey(undefined)).toBe('track');
  });
  it('is "track" for an explicitly empty itemType, same as absent', () => {
    expect(playlistQueueKey('')).toBe('track');
  });
});

describe('mvTransportVisibility', () => {
  it('hides both for a non-music-video, single-item source', () => {
    expect(mvTransportVisibility(false, false)).toEqual({ shuffle: false, repeat: true });
  });
  it('shows only Repeat for a non-music-video multi-item source (a series)', () => {
    expect(mvTransportVisibility(false, true)).toEqual({ shuffle: false, repeat: true });
  });
  it('hides both for a lone music-video pick — nothing to shuffle or repeat', () => {
    expect(mvTransportVisibility(true, false)).toEqual({ shuffle: false, repeat: false });
  });
  it('shows both for a multi-item music-video playthrough', () => {
    expect(mvTransportVisibility(true, true)).toEqual({ shuffle: true, repeat: true });
  });
});
