import { registerScreen } from '../../core/screen-registry.js';

export function setup(handleVideoKey, remote) {
  registerScreen('screen-video', {
    onEnter: function() { document.getElementById('btn-back-video').focus(); },
    keys: {
      Escape:     handleVideoKey,
      Backspace:  handleVideoKey,
      ' ':        handleVideoKey,
      Enter:      handleVideoKey,
      ArrowLeft:  handleVideoKey,
      ArrowRight: handleVideoKey,
      ArrowUp:    handleVideoKey,
      ArrowDown:  handleVideoKey
    },
    remote: remote
  });
}
