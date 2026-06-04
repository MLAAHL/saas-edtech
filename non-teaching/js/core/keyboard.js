// ============================================================================
// KEYBOARD SHORTCUTS — Global keyboard shortcuts for the admin dashboard
// ============================================================================

(function () {
  'use strict';

  var overlayVisible = false;

  var SHORTCUTS = [
    { keys: 'Ctrl + K', desc: 'Focus search' },
    { keys: 'Escape', desc: 'Close modal / drawer' },
    { keys: 'Ctrl + S', desc: 'Save current form' },
    { keys: 'Ctrl + Shift + D', desc: 'Go to Dashboard' },
    { keys: '?', desc: 'Show this help' }
  ];

  function showShortcutOverlay() {
    if (overlayVisible) { hideShortcutOverlay(); return; }
    overlayVisible = true;

    var overlay = document.createElement('div');
    overlay.id = 'keyboard-shortcuts-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100001;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;';

    var rows = SHORTCUTS.map(function (s) {
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">' +
        '<span style="font-size:13px;color:#8A8A92;">' + s.desc + '</span>' +
        '<kbd style="background:#242427;border:1px solid rgba(255,255,255,0.08);border-radius:5px;padding:3px 8px;font-size:11px;font-weight:600;color:#E8E8EC;font-family:\'Inter\',monospace;">' + s.keys + '</kbd>' +
        '</div>';
    }).join('');

    overlay.innerHTML =
      '<div style="background:#1E1E1E;border:1px solid #2A2A2A;border-radius:12px;padding:24px;width:380px;max-width:90vw;transform:translateY(20px);opacity:0;transition:all 0.2s;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
          '<h3 style="font-size:15px;font-weight:700;color:#E8E8EC;margin:0;">Keyboard Shortcuts</h3>' +
          '<button onclick="document.getElementById(\'keyboard-shortcuts-overlay\').remove();window._kbOverlayVisible=false;" style="background:none;border:none;color:#4E4E56;cursor:pointer;display:flex;"><span class="material-symbols-rounded" style="font-size:18px;">close</span></button>' +
        '</div>' +
        rows +
      '</div>';

    document.body.appendChild(overlay);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.style.opacity = '1';
        var box = overlay.firstElementChild;
        if (box) {
          box.style.transform = 'translateY(0)';
          box.style.opacity = '1';
        }
      });
    });

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) hideShortcutOverlay();
    });
  }

  function hideShortcutOverlay() {
    overlayVisible = false;
    window._kbOverlayVisible = false;
    var overlay = document.getElementById('keyboard-shortcuts-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(function () { overlay.remove(); }, 200);
    }
  }

  // Track overlay state globally for the inline onclick
  window._kbOverlayVisible = false;

  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

    // Escape — close any modal or drawer
    if (e.key === 'Escape') {
      // Close keyboard shortcut overlay
      if (overlayVisible) { hideShortcutOverlay(); return; }

      // Close confirm dialog
      var confirmOverlay = document.getElementById('confirm-dialog-overlay');
      if (confirmOverlay) { confirmOverlay.remove(); return; }

      // Close any .modal.active or similar
      var openModals = document.querySelectorAll('.modal.active, [id$="Modal"]:not(.hidden)');
      openModals.forEach(function (m) {
        m.classList.remove('active');
        m.classList.add('hidden');
      });
      return;
    }

    // Don't fire shortcuts when typing in inputs (except Escape above)
    if (isInput && e.key !== 'Escape') {
      // Allow Ctrl+S even in inputs
      if (!(e.ctrlKey && e.key === 's')) return;
    }

    // ? — Show keyboard shortcuts (only when not in input)
    if (e.key === '?' && !isInput) {
      e.preventDefault();
      showShortcutOverlay();
      return;
    }

    // Ctrl+K — Focus search
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      var search = document.getElementById('searchInput') ||
                   document.getElementById('studentSearch') ||
                   document.querySelector('input[type="search"]') ||
                   document.querySelector('.search-input');
      if (search) search.focus();
      return;
    }

    // Ctrl+S — Save current form
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      var activeForm = document.querySelector('form:not(.hidden)');
      if (activeForm) {
        var submitBtn = activeForm.querySelector('button[type="submit"]') ||
                        activeForm.querySelector('.btn-primary');
        if (submitBtn) submitBtn.click();
      }
      return;
    }

    // Ctrl+Shift+D — Go to dashboard
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
      e.preventDefault();
      window.location.href = 'dashboard.html';
      return;
    }
  });

})();
