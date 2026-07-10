// TASK-322 (FEAT-046) — the artist page's grouped song model. Pure assembly of an
// artist's ordered tracks from the per-album detail records the page fetches
// (client-side option (b): no dedicated backend endpoint, so no co-deploy). The
// album records arrive in the artist source order (albums newest-first — see
// core/home-rails albumsByArtist), and each record's items[] is the album's own
// track order, so flattening them in sequence reproduces the backend's artist
// source ordering (catalog.artist_tracks = albums newest-first, then track order)
// — the order "continue from here" plays in. Each track is tagged with its owning
// album so the screen renders an album header when the album changes. DOM/render
// lives in the screen; this stays provable in a unit test (mutation-gated,
// core/**).
//
// albums: the loaded /api/album records in display order —
//   [{ id, title, items:[{ episode?, video }] }, ...]. A null/failed album (a 404
// the page mapped to null) or one with no items contributes nothing. Returns a
// detail-list-shaped record { title, poster, items } where each item is
// { episode, video, albumId, albumTitle } — the shape screen-detail buildDetailList
// consumes, plus the album tag it groups the header rows on. poster is null so each
// row falls back to its own track/album art.
export function artistTracks(artist, albums) {
  var items = [];
  (albums || []).filter(Boolean).forEach(function(album) {
    (album.items || []).forEach(function(track) {
      items.push({ episode: track.episode, video: track.video, albumId: album.id, albumTitle: album.title });
    });
  });
  return { title: artist, poster: null, items: items };
}
