'use strict';
(() => {
  const notice = document.getElementById('firstVisitNotice');
  const app = document.querySelector('main.shell');
  const checkbox = document.getElementById('legalAcknowledged');
  const continueButton = document.getElementById('continueToApp');
  const storageKey = 'hanzet-scraper-legal-ack-v1';

  function startApp() {
    notice.remove();
    app.removeAttribute('inert');
    window.dispatchEvent(new CustomEvent('hanzet:legal-acknowledged'));
    const script = document.createElement('script');
    script.src = 'ui/js/app.js';
    script.defer = true;
    document.body.appendChild(script);
  }

  try {
    if (localStorage.getItem(storageKey) === 'accepted') {
      startApp();
      return;
    }
  } catch (_) {
    // If storage is blocked, show the notice on each visit.
  }

  app.setAttribute('inert', '');
  checkbox.addEventListener('change', () => {
    continueButton.disabled = !checkbox.checked;
  });
  continueButton.addEventListener('click', () => {
    if (!checkbox.checked) return;
    try {
      localStorage.setItem(storageKey, 'accepted');
    } catch (_) {
      // Acknowledge for this visit only.
    }
    startApp();
  });
  checkbox.focus();
})();
