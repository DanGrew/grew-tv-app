import { trackFilename, lyricsFilename, playlistM3uFilename } from '../../core/downloads-filename.js';

describe('trackFilename', () => {
  it('is "{artist} - {title}.{ext}"', () => {
    expect(trackFilename({ artist: 'ELO', title: 'Mr. Blue Sky', ext: 'm4a' })).toBe('ELO - Mr. Blue Sky.m4a');
  });
  it('drops the "artist - " prefix when artist is absent', () => {
    expect(trackFilename({ artist: null, title: 'Untitled', ext: 'mp3' })).toBe('Untitled.mp3');
  });
  it('sanitizes filesystem-illegal characters in artist and title', () => {
    expect(trackFilename({ artist: 'AC/DC', title: 'T:N:T', ext: 'm4a' })).toBe('AC_DC - T_N_T.m4a');
  });
  it('trims surrounding whitespace after sanitizing', () => {
    expect(trackFilename({ artist: ' Queen ', title: ' Bohemian Rhapsody ', ext: 'm4a' })).toBe('Queen - Bohemian Rhapsody.m4a');
  });
});

describe('lyricsFilename', () => {
  it('is the same basename as trackFilename with .lrc instead of ext', () => {
    var track = { artist: 'ELO', title: 'Mr. Blue Sky', ext: 'm4a' };
    expect(lyricsFilename(track)).toBe('ELO - Mr. Blue Sky.lrc');
    expect(lyricsFilename(track).replace('.lrc', '')).toBe(trackFilename(track).replace('.m4a', ''));
  });
});

describe('playlistM3uFilename', () => {
  it('sanitizes the playlist title with a .m3u extension', () => {
    expect(playlistM3uFilename('Car: long drives')).toBe('Car_ long drives.m3u');
  });
});
