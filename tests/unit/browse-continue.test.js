import { describe, it, expect } from 'vitest';
import { CONTINUE_TYPES, continueTarget, continueLabel } from '../../core/browse-continue.js';

// TASK-501 — browse's Continue cluster is DATA: one entry per media type, the
// player page each press lands on, and the one wording both surfaces render.

describe('CONTINUE_TYPES', () => {
  it('covers all four media types, in browse-tab order', () => {
    expect(CONTINUE_TYPES.map(e => e.mediaType)).toEqual(['film', 'home-movie', 'music', 'music-video']);
  });
  it('names each button and labels it with its section name', () => {
    expect(CONTINUE_TYPES.map(e => e.id)).toEqual([
      'btn-continue-film', 'btn-continue-home-movie', 'btn-continue-music', 'btn-continue-music-video'
    ]);
    expect(CONTINUE_TYPES.map(e => e.label)).toEqual(['Films', 'Home Movies', 'Music', 'Music Videos']);
  });
});

describe('continueTarget', () => {
  // Films, home movies and music videos all carry on in the video player;
  // music in the audio player. Each names its own media type so the player
  // fires `next` on that engine and no other (story 4's TV/phone parity rides
  // on the two surfaces resolving the identical target).
  it('sends films, home movies and music videos to the video player', () => {
    expect(continueTarget('film')).toEqual({ page: 'video.html', params: { continueType: 'film', from: 'browse' } });
    expect(continueTarget('home-movie')).toEqual({ page: 'video.html', params: { continueType: 'home-movie', from: 'browse' } });
    expect(continueTarget('music-video')).toEqual({ page: 'video.html', params: { continueType: 'music-video', from: 'browse' } });
  });
  it('sends music to the audio player', () => {
    expect(continueTarget('music')).toEqual({ page: 'audio.html', params: { continueType: 'music', from: 'browse' } });
  });
});

describe('continueLabel', () => {
  it('is the ▶ glyph and the type\'s own name', () => {
    expect(continueLabel({ label: 'Films' })).toBe('▶ Continue Films');
    expect(continueLabel({ label: 'Music Videos' })).toBe('▶ Continue Music Videos');
  });
  it('labels every configured type', () => {
    expect(CONTINUE_TYPES.map(continueLabel)).toEqual([
      '▶ Continue Films', '▶ Continue Home Movies', '▶ Continue Music', '▶ Continue Music Videos'
    ]);
  });
});
