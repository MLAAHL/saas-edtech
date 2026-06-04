// ============================================================================
// UI UTILITIES — Shared across all admin dashboard pages
// ============================================================================

(function () {
  'use strict';

  // ── TOAST NOTIFICATIONS ──────────────────────────────────────────────────
  // Bottom-right slide-up toast with auto-dismiss
  let toastContainer = null;

  function ensureToastContainer() {
    if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none;';
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  const TOAST_ICONS = {
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info'
  };

  const TOAST_COLORS = {
    success: { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.25)', color: '#34D399' },
    error: { bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)', color: '#F87171' },
    warning: { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.25)', color: '#FBBF24' },
    info: { bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.25)', color: '#A78BFA' }
  };

  function showToast(message, type, duration) {
    type = type || 'success';
    duration = duration || 3000;
    const container = ensureToastContainer();
    const colors = TOAST_COLORS[type] || TOAST_COLORS.info;
    const icon = TOAST_ICONS[type] || 'info';

    const toast = document.createElement('div');
    toast.style.cssText = [
      'pointer-events:auto',
      'display:flex',
      'align-items:center',
      'gap:10px',
      'padding:12px 16px',
      'background:#1E1E1E',
      'border:1px solid ' + colors.border,
      'border-radius:10px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.4)',
      'min-width:280px',
      'max-width:420px',
      'transform:translateY(20px)',
      'opacity:0',
      'transition:all 0.25s cubic-bezier(0.4,0,0.2,1)'
    ].join(';');

    toast.innerHTML =
      '<span class="material-symbols-rounded" style="font-size:20px;color:' + colors.color + ';">' + icon + '</span>' +
      '<span style="flex:1;font-size:13px;font-weight:500;color:#E8E8EC;">' + message + '</span>' +
      '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:#4E4E56;cursor:pointer;padding:2px;display:flex;">' +
      '<span class="material-symbols-rounded" style="font-size:16px;">close</span></button>';

    container.appendChild(toast);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
      });
    });

    setTimeout(function () {
      toast.style.transform = 'translateY(20px)';
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 250);
    }, duration);
  }

  // ── SKELETON LOADERS ─────────────────────────────────────────────────────
  // Dark shimmer skeleton rows matching the dark theme
  function showSkeleton(containerId, rows, cols) {
    rows = rows || 5;
    cols = cols || 4;
    var container = document.getElementById(containerId);
    if (!container) return;

    var html = '';
    for (var r = 0; r < rows; r++) {
      html += '<div class="skeleton-row" style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.03);">';
      for (var c = 0; c < cols; c++) {
        var width = c === 0 ? '35%' : (c === cols - 1 ? '15%' : '20%');
        html += '<div class="skeleton-cell" style="flex:0 0 ' + width + ';height:16px;background:linear-gradient(90deg,#2A2A2A 25%,#333 50%,#2A2A2A 75%);background-size:200% 100%;border-radius:6px;animation:shimmer 1.5s infinite;"></div>';
      }
      html += '</div>';
    }
    container.innerHTML = html;
  }

  // Skeleton for stat cards
  function showStatSkeleton(containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.textContent = '';
    var el = document.createElement('div');
    el.className = 'skeleton-cell';
    el.style.cssText = 'width:60px;height:32px;background:linear-gradient(90deg,#2A2A2A 25%,#333 50%,#2A2A2A 75%);background-size:200% 100%;border-radius:8px;animation:shimmer 1.5s infinite;';
    container.appendChild(el);
  }

  // ── BUTTON LOADING STATE ─────────────────────────────────────────────────
  function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.dataset.originalText = btn.innerHTML;
      btn.disabled = true;
      btn.style.opacity = '0.7';
      btn.style.pointerEvents = 'none';
      btn.innerHTML = '<div style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite;display:inline-block;"></div> <span style="margin-left:6px;">Loading...</span>';
    } else {
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.pointerEvents = '';
      btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
      delete btn.dataset.originalText;
    }
  }

  // ── CONFIRM DIALOG ───────────────────────────────────────────────────────
  // Custom dark modal replacing window.confirm()
  function confirmDialog(title, message, onConfirm, danger) {
    // Remove any existing dialog
    var existing = document.getElementById('confirm-dialog-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'confirm-dialog-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100000;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;';

    var confirmBtnBg = danger ? '#DC2626' : '#34D399';
    var confirmBtnHover = danger ? '#B91C1C' : '#059669';

    overlay.innerHTML =
      '<div id="confirm-dialog-box" style="background:#1E1E1E;border:1px solid #2A2A2A;border-radius:12px;padding:24px;width:380px;max-width:90vw;transform:translateY(20px);opacity:0;transition:all 0.2s ease;">' +
        '<h3 style="font-size:16px;font-weight:700;color:#E8E8EC;margin-bottom:8px;">' + title + '</h3>' +
        '<p style="font-size:13px;color:#8A8A92;line-height:1.5;margin-bottom:24px;">' + message + '</p>' +
        '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
          '<button id="confirm-dialog-cancel" style="padding:8px 16px;background:transparent;border:1px solid #2A2A2A;color:#E8E8EC;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all 0.15s;">Cancel</button>' +
          '<button id="confirm-dialog-confirm" style="padding:8px 16px;background:' + confirmBtnBg + ';border:none;color:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.15s;">' + (danger ? 'Delete' : 'Confirm') + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    var box = document.getElementById('confirm-dialog-box');

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        overlay.style.opacity = '1';
        box.style.transform = 'translateY(0)';
        box.style.opacity = '1';
      });
    });

    function close() {
      overlay.style.opacity = '0';
      box.style.transform = 'translateY(20px)';
      box.style.opacity = '0';
      setTimeout(function () { overlay.remove(); }, 200);
    }

    document.getElementById('confirm-dialog-cancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    document.getElementById('confirm-dialog-confirm').addEventListener('click', function () {
      close();
      if (typeof onConfirm === 'function') onConfirm();
    });

    // Escape key closes
    function onKey(e) {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onKey);
      }
    }
    document.addEventListener('keydown', onKey);
  }

  // ── EMPTY STATE ──────────────────────────────────────────────────────────
  function showEmptyState(containerId, icon, title, subtitle) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML =
      '<div style="text-align:center;padding:40px 20px;">' +
        '<span class="material-symbols-rounded" style="font-size:40px;color:#4E4E56;display:block;margin-bottom:12px;">' + (icon || 'inbox') + '</span>' +
        '<div style="font-size:15px;font-weight:600;color:#8A8A92;margin-bottom:6px;">' + (title || 'No data found') + '</div>' +
        '<div style="font-size:12px;color:#4E4E56;">' + (subtitle || '') + '</div>' +
      '</div>';
  }

  // ── FORMATTING UTILITIES ─────────────────────────────────────────────────
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var day = ('0' + d.getDate()).slice(-2);
    return day + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatPercent(value) {
    var num = parseFloat(value);
    if (isNaN(num)) return '<span style="color:#4E4E56;">—</span>';
    var color = num >= 90 ? '#34D399' : (num >= 75 ? '#FBBF24' : '#F87171');
    return '<span style="color:' + color + ';font-weight:600;">' + num.toFixed(1) + '%</span>';
  }

  function timeAgo(date) {
    if (!date) return '';
    var seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    return days + 'd ago';
  }

  // ── DEBOUNCE ─────────────────────────────────────────────────────────────
  function debounce(fn, delay) {
    var timer;
    return function () {
      var context = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(context, args);
      }, delay);
    };
  }

  // ── PAGINATION ───────────────────────────────────────────────────────────
  function paginate(data, page, pageSize) {
    pageSize = pageSize || 25;
    page = Math.max(1, page || 1);
    var totalPages = Math.ceil(data.length / pageSize);
    page = Math.min(page, Math.max(1, totalPages));
    var start = (page - 1) * pageSize;
    return {
      items: data.slice(start, start + pageSize),
      page: page,
      pageSize: pageSize,
      totalItems: data.length,
      totalPages: totalPages,
      startIndex: start,
      endIndex: Math.min(start + pageSize, data.length)
    };
  }

  function renderPagination(containerId, totalItems, currentPage, pageSize, onPageChange) {
    var container = document.getElementById(containerId);
    if (!container) return;
    pageSize = pageSize || 25;
    var totalPages = Math.ceil(totalItems / pageSize);
    if (totalPages <= 1) {
      container.innerHTML = '<div style="font-size:12px;color:#4E4E56;">Showing 1–' + totalItems + ' of ' + totalItems + '</div>';
      return;
    }

    var start = (currentPage - 1) * pageSize + 1;
    var end = Math.min(currentPage * pageSize, totalItems);

    var html = '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;">';
    html += '<div style="font-size:12px;color:#4E4E56;">Showing ' + start + '–' + end + ' of ' + totalItems + '</div>';
    html += '<div style="display:flex;gap:4px;align-items:center;">';

    // Prev button
    html += '<button class="pg-btn' + (currentPage <= 1 ? ' pg-disabled' : '') + '" data-page="' + (currentPage - 1) + '"' + (currentPage <= 1 ? ' disabled' : '') + '>Previous</button>';

    // Page numbers
    var pages = getPageNumbers(currentPage, totalPages);
    for (var i = 0; i < pages.length; i++) {
      if (pages[i] === '...') {
        html += '<span style="color:#4E4E56;font-size:12px;padding:0 4px;">…</span>';
      } else {
        html += '<button class="pg-btn' + (pages[i] === currentPage ? ' pg-active' : '') + '" data-page="' + pages[i] + '">' + pages[i] + '</button>';
      }
    }

    // Next button
    html += '<button class="pg-btn' + (currentPage >= totalPages ? ' pg-disabled' : '') + '" data-page="' + (currentPage + 1) + '"' + (currentPage >= totalPages ? ' disabled' : '') + '>Next</button>';
    html += '</div></div>';

    container.innerHTML = html;

    // Event delegation
    container.addEventListener('click', function handler(e) {
      var btn = e.target.closest('.pg-btn');
      if (!btn || btn.disabled) return;
      var page = parseInt(btn.dataset.page);
      if (page && page >= 1 && page <= totalPages) {
        container.removeEventListener('click', handler);
        if (typeof onPageChange === 'function') onPageChange(page);
      }
    });
  }

  function getPageNumbers(current, total) {
    if (total <= 7) {
      var arr = [];
      for (var i = 1; i <= total; i++) arr.push(i);
      return arr;
    }
    if (current <= 3) return [1, 2, 3, 4, '...', total];
    if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
    return [1, '...', current - 1, current, current + 1, '...', total];
  }

  // ── TABLE SORTING ────────────────────────────────────────────────────────
  function sortTable(data, key, direction) {
    direction = direction || 'asc';
    return data.slice().sort(function (a, b) {
      var valA = a[key];
      var valB = b[key];
      if (valA == null) valA = '';
      if (valB == null) valB = '';
      if (typeof valA === 'number' && typeof valB === 'number') {
        return direction === 'asc' ? valA - valB : valB - valA;
      }
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // ── CSV EXPORT ───────────────────────────────────────────────────────────
  function exportToCSV(data, filename) {
    if (!data || data.length === 0) {
      showToast('No data to export', 'warning');
      return;
    }
    var keys = Object.keys(data[0]).filter(function (k) {
      return k !== '_id' && k !== '__v';
    });
    var csvRows = [keys.join(',')];

    data.forEach(function (row) {
      var values = keys.map(function (key) {
        var val = row[key];
        if (val == null) val = '';
        val = String(val).replace(/"/g, '""');
        if (val.indexOf(',') !== -1 || val.indexOf('"') !== -1 || val.indexOf('\n') !== -1) {
          val = '"' + val + '"';
        }
        return val;
      });
      csvRows.push(values.join(','));
    });

    var csv = csvRows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename || 'export.csv';
    link.click();
    URL.revokeObjectURL(url);
    showToast('Exported ' + data.length + ' records', 'success');
  }

  // ── INJECT GLOBAL ANIMATION KEYFRAMES ────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('ui-utils-styles')) return;
    var style = document.createElement('style');
    style.id = 'ui-utils-styles';
    style.textContent = [
      '@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}',
      '@keyframes spin{100%{transform:rotate(360deg)}}',
      '@keyframes fadeIn{from{opacity:0}to{opacity:1}}',
      '@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}',
      '.pg-btn{padding:4px 10px;background:transparent;border:1px solid rgba(255,255,255,0.05);color:#8A8A92;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;transition:all 0.15s;}',
      '.pg-btn:hover:not(:disabled){background:rgba(255,255,255,0.04);color:#E8E8EC;border-color:rgba(255,255,255,0.09);}',
      '.pg-btn.pg-active{background:rgba(167,139,250,0.12);color:#A78BFA;border-color:rgba(167,139,250,0.25);}',
      '.pg-btn.pg-disabled{opacity:0.3;cursor:not-allowed;}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // Initialize on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectStyles);
  } else {
    injectStyles();
  }

  // ── EXPORT TO GLOBAL ─────────────────────────────────────────────────────
  window.UI = {
    showToast: showToast,
    showSkeleton: showSkeleton,
    showStatSkeleton: showStatSkeleton,
    setButtonLoading: setButtonLoading,
    confirmDialog: confirmDialog,
    showEmptyState: showEmptyState,
    formatDate: formatDate,
    formatPercent: formatPercent,
    timeAgo: timeAgo,
    debounce: debounce,
    paginate: paginate,
    renderPagination: renderPagination,
    sortTable: sortTable,
    exportToCSV: exportToCSV
  };

})();
