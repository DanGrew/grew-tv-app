// TASK-602 (FEAT-526) — the volume rocker off a channel. The handset's − and +
// arrive as the printable `-` and `=` (docs: claude-workflow KEYMAP.md), and on
// the video player, the music player and the Queue overlay they PRESS the ⏮ and
// ⏭ already drawn there. Nothing here decides what "previous" or "next" means
// for a media type: the drawn control already carries that, and already dims
// when there is nothing to step to, so a press inherits both.
//
// The channel player keeps its own claim on the same two keys (channel down/up,
// ui/screens/screen-channel-player.js) and never reaches this module.

export var ROCKER_ACTIONS = { '-': 'previous', '=': 'next' };

// The player row's own ⏮/⏭ for each action — the same ids on video.html and
// audio.html.
export var ROCKER_BUTTONS = { previous: 'btn-prev', next: 'btn-next' };

// Which transport a press lands on. Anything drawn over the player — the Jump
// grid, the ＋ Playlist sheet, the Up-next countdown — swallows it; the Queue
// overlay presses its own hero; otherwise the player row.
export function rockerTarget(queueOpen, overlayOpen) {
  if (overlayOpen) return 'none';
  if (queueOpen) return 'queue';
  return 'player';
}
