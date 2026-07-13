import { describe, it, expect } from 'vitest';
import { resumeOf, episodeLabel, durationMarkup, progressBarMarkup, typeLabel, collectionMetaLine, detailTagMarkup } from '../../core/detail-view.js';

describe('resumeOf', () => {
  it('returns 0 when no entry', () => {
    expect(resumeOf(undefined)).toBe(0);
    expect(resumeOf(null)).toBe(0);
  });
  it('returns the resume position from an entry', () => {
    expect(resumeOf({ resumePositionSec: 142 })).toBe(142);
  });
});

describe('episodeLabel', () => {
  it('prefixes the episode number when present', () => {
    expect(episodeLabel({ episode: 3, video: { title: 'Mud' } })).toBe('3. Mud');
  });
  it('falls back to the bare title with no number', () => {
    expect(episodeLabel({ video: { title: 'The Pool' } })).toBe('The Pool');
  });
  it('treats episode 0 as a real number', () => {
    expect(episodeLabel({ episode: 0, video: { title: 'Pilot' } })).toBe('0. Pilot');
  });
});

describe('durationMarkup', () => {
  it('renders a duration div', () => {
    expect(durationMarkup(90)).toBe('<div class="detail-duration">1:30</div>');
  });
  it('is empty for a falsy duration', () => {
    expect(durationMarkup(0)).toBe('');
    expect(durationMarkup(null)).toBe('');
  });
});

describe('progressBarMarkup', () => {
  it('renders a bar with the class and fill width when mid-watch', () => {
    expect(progressBarMarkup(true, 40, 'detail-progress'))
      .toBe('<div class="detail-progress"><div class="detail-progress-fill" style="width:40%"></div></div>');
  });
  it('is empty when not mid-watch', () => {
    expect(progressBarMarkup(false, 40, 'ep-progress')).toBe('');
  });
});

describe('typeLabel', () => {
  it('maps a known type to a friendly label', () => {
    expect(typeLabel('animation')).toBe('Cartoons');
    expect(typeLabel('home')).toBe('Home videos');
  });
  it('falls back to the raw type when unmapped', () => {
    expect(typeLabel('documentary')).toBe('documentary');
  });
  it('maps every declared type to its friendly label', () => {
    expect(typeLabel('home-video')).toBe('Home videos');
    expect(typeLabel('tv-series')).toBe('Episodes');
    expect(typeLabel('film')).toBe('Film');
    expect(typeLabel('action')).toBe('Action');
  });
  it('is empty for an absent type', () => {
    expect(typeLabel(null)).toBe('');
    expect(typeLabel(undefined)).toBe('');
  });
});

describe('collectionMetaLine', () => {
  it('joins the type label and a pluralised clip count', () => {
    expect(collectionMetaLine({ type: 'home', items: [1, 2, 3, 4, 5, 6] })).toBe('Home videos · 6 clips');
  });
  it('uses the singular for a single clip', () => {
    expect(collectionMetaLine({ type: 'animation', items: [1] })).toBe('Cartoons · 1 clip');
  });
  it('drops the type segment when the type is absent', () => {
    expect(collectionMetaLine({ items: [1, 2, 3] })).toBe('3 clips');
  });
  it('handles a missing items array', () => {
    expect(collectionMetaLine({ type: 'home' })).toBe('Home videos · 0 clips');
  });
});

describe('detailTagMarkup', () => {
  it('renders a RESUME tag with the time left when mid-watch', () => {
    expect(detailTagMarkup(true, 70, false)).toBe('<div class="detail-tag">RESUME · 1:10 left</div>');
  });
  it('RESUME wins over NEXT', () => {
    expect(detailTagMarkup(true, 70, true)).toBe('<div class="detail-tag">RESUME · 1:10 left</div>');
  });
  it('renders a NEXT tag for the play-next row', () => {
    expect(detailTagMarkup(false, 0, true)).toBe('<div class="detail-tag">NEXT</div>');
  });
  it('is empty for a plain row', () => {
    expect(detailTagMarkup(false, 0, false)).toBe('');
  });
});
