import { registerScreen } from '../../core/screen-registry.js';

registerScreen('screen-error', {
  onEnter: function() { document.getElementById('btn-retry').focus(); },
  keys: {
    Enter: function() { document.getElementById('btn-retry').click(); }
  },
  remote: {
    select: function() { document.getElementById('btn-retry').click(); },
    back:   function() { document.getElementById('btn-retry').click(); }
  }
});
