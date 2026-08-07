// ============================================================================
// ROUTER — Active nav detection and breadcrumb generation
// ============================================================================

(function () {
  'use strict';

  // Pages are linked and served without the .html suffix, but a bookmark or a
  // local file:// open can still carry one — compare on the bare name so both
  // forms light up the same nav item.
  function normalise(value) {
    var name = String(value || '').split('?')[0].split('#')[0];
    name = name.split('/').pop();
    if (name.slice(-5) === '.html') name = name.slice(0, -5);
    return name || 'index';
  }

  function getCurrentPage() {
    return normalise(window.location.pathname);
  }

  function highlightActiveNav() {
    var currentPage = getCurrentPage();
    var links = document.querySelectorAll('.sb-link');

    links.forEach(function (link) {
      link.classList.remove('active');
      if (normalise(link.getAttribute('href')) === currentPage) {
        link.classList.add('active');
      }
    });
  }

  function getPageTitle(filename) {
    var titles = {
      'dashboard': 'Dashboard',
      'students': 'Students',
      'report': 'Reports',
      'view-attendance': 'View Attendance',
      'promotion': 'Promote',
      'ai-assistant': 'AI Assistant',
      'teachers': 'Teachers',
      'parents-status': 'Parent Status',
      'mentorship': 'Mentors',
      'index': 'Login'
    };
    return titles[normalise(filename)] || 'Dashboard';
  }

  function renderBreadcrumb(containerId, extraItems) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var page = getCurrentPage();
    var items = [
      { label: 'Dashboard', href: 'dashboard' }
    ];

    if (page !== 'dashboard') {
      items.push({ label: getPageTitle(page), href: null });
    }

    if (extraItems && Array.isArray(extraItems)) {
      extraItems.forEach(function (item) { items.push(item); });
    }

    container.innerHTML = items.map(function (item, i) {
      var isLast = i === items.length - 1;
      if (isLast) {
        return '<span style="color:#E8E8EC;font-weight:600;">' + item.label + '</span>';
      }
      return '<a href="' + item.href + '" style="color:#4E4E56;text-decoration:none;transition:color 0.15s;">' + item.label + '</a>' +
        '<span style="color:#4E4E56;margin:0 6px;">/</span>';
    }).join('');
  }

  // Auto-initialize on DOM ready
  function init() {
    highlightActiveNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── EXPORT ──────────────────────────────────────────────────────────────
  window.Router = {
    getCurrentPage: getCurrentPage,
    getPageTitle: getPageTitle,
    highlightActiveNav: highlightActiveNav,
    renderBreadcrumb: renderBreadcrumb
  };

})();
