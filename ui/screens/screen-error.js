import { registerScreen } from '../../core/screen-registry.js';

registerScreen('screen-error', {
  onEnter: function() { document.getElementById('btn-retry').focus(); },
  keys: {},
  remote: {}
});
