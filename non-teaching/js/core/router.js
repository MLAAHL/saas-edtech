// ============================================================================
// ROUTER — Active nav detection and breadcrumb generation
// ============================================================================

(function () {
  'use strict';

  function getCurrentPage() {
    var path = window.location.pathname;
    var filename = path.split('/').pop() || 'index.html';
    return filename;
  }

  function highlightActiveNav() {
    var currentPage = getCurrentPage();
    var links = document.querySelectorAll('.sb-link');

    links.forEach(function (link) {
      var href = link.getAttribute('href') || '';
      link.classList.remove('active');

      if (href === currentPage) {
        link.classList.add('active');
      }
    });
  }

  function getPageTitle(filename) {
    var titles = {
      'dashboard.html': 'Dashboard',
      'students.html': 'Students',
      'report.html': 'Reports',
      'view-attendance.html': 'View Attendance',
      'promotion.html': 'Promote',
      'ai-assistant.html': 'AI Assistant',
      'teachers.html': 'Teachers',
      'parents-status.html': 'Parent Status',
      'mentorship.html': 'Mentors',
      'index.html': 'Login'
    };
    return titles[filename] || 'Dashboard';
  }

  function renderBreadcrumb(containerId, extraItems) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var page = getCurrentPage();
    var items = [
      { label: 'Dashboard', href: 'dashboard.html' }
    ];

    if (page !== 'dashboard.html') {
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
