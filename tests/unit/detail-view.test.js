import { describe, it, expect } from 'vitest';
import { resumeOf, episodeLabel, durationMarkup, progressBarMarkup } from '../../core/detail-view.js';

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
