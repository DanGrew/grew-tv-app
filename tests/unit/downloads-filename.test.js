import { trackFilename, lyricsFilename, playlistFolderName, playlistM3uFilename } from '../../core/downloads-filename.js';

describe('trackFilename', () => {
  it('is "{index} - {artist} - {title}.{ext}", zero-padded to at least 2 digits', () => {
    expect(trackFilename({ artist: 'ELO', title: 'Mr. Blue Sky', ext: 'm4a' }, 1, 9)).toBe('01 - ELO - Mr. Blue Sky.m4a');
  });
  it('drops the "artist - " prefix when artist is absent, keeping the index prefix', () => {
    expect(trackFilename({ artist: null, title: 'Untitled', ext: 'mp3' }, 3, 9)).toBe('03 - Untitled.mp3');
  });
  it('sanitizes filesystem-illegal characters in artist and title', () => {
    expect(trackFilename({ artist: 'AC/DC', title: 'T:N:T', ext: 'm4a' }, 1, 1)).toBe('01 - AC_DC - T_N_T.m4a');
  });
  it('trims surrounding whitespace after sanitizing', () => {
    expect(trackFilename({ artist: ' Queen ', title: ' Bohemian Rhapsody ', ext: 'm4a' }, 1, 1)).toBe('01 - Queen - Bohemian Rhapsody.m4a');
  });
  // BUG-416 — folder-view players sort by filename, so the index prefix
  // widens to fit a triple-digit (or wider) playlist rather than breaking
  // sort order past track 99.
  it('widens the zero-padding to fit a playlist of 100+ tracks', () => {
    expect(trackFilename({ artist: 'A', title: 'Track Five', ext: 'mp3' }, 5, 123)).toBe('005 - A - Track Five.mp3');
  });
});

describe('lyricsFilename', () => {
  it('is the same basename (index prefix included) as trackFilename with .lrc instead of ext', () => {
    var track = { artist: 'ELO', title: 'Mr. Blue Sky', ext: 'm4a' };
    expect(lyricsFilename(track, 2, 9)).toBe('02 - ELO - Mr. Blue Sky.lrc');
    expect(lyricsFilename(track, 2, 9).replace('.lrc', '')).toBe(trackFilename(track, 2, 9).replace('.m4a', ''));
  });
});

describe('playlistFolderName', () => {
  it('sanitizes the playlist title for use as a folder name', () => {
    expect(playlistFolderName('Car: long drives')).toBe('Car_ long drives');
  });
});

describe('playlistM3uFilename', () => {
  it('is the playlist folder name with a .m3u extension', () => {
    expect(playlistM3uFilename('Car: long drives')).toBe('Car_ long drives.m3u');
  });
});
