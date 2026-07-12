// Pure helper for the FEAT-036 (TASK-206) "Add to playlist" picker. Given a
// browse list (the /api/browse `content` array, already profile-filtered by the
// backend — get_browse_list(profile) only returns the active profile's
// collections), pull out the user playlists the track can be added to.
//
// Profile correctness rides the browse fetch, NOT a per-card field: the picker
// requests browse with the TRACK's profile, so every playlist card returned
// already matches (the browse card carries no `profile` of its own, and the
// add-track API 400-on-mismatch is the backstop). Each card reduces to the
// minimum the sheet renders: the id to POST and the title to show.
// `excludeId` (optional, FEAT-036/TASK-212) drops one playlist from the list —
// used by the playlist-detail bulk-add sheet so a playlist is never offered as a
// target for adding INTO itself (the add-source API 400s a self-add anyway, this
// just hides the dead choice). Omitted/undefined keeps every playlist.
export function playlistCards(browseContent, excludeId) {
  if (!browseContent) return [];
  return browseContent
    .filter(function(c) { return c.collectionType === 'playlist'; })
    .filter(function(c) { return c.id !== excludeId; })
    .map(function(c) { return { id: c.id, title: c.title }; });
}
