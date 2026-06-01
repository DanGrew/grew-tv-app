import { registerScreen } from '../../core/screen-registry.js';

registerScreen('screen-profile', {
  onEnter: function() { document.getElementById('btn-kids').focus(); },
  keys: {},
  remote: {}
});
