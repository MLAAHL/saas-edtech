// ============================================================================
// DASHBOARD PAGE — Stats, charts, today's overview, classes list, alerts
// ============================================================================

(function () {
  'use strict';

  var attendanceChart = null;
  var streamChart = null;
  var currentPeriod = 'month';
  var lastFetchTime = null;
  var autoRefreshInterval = null;

  // ── HELPERS ──────────────────────────────────────────────────────────────
  function setVal(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = (val !== null && val !== undefined) ? val : '—';
  }

  function setStatStatus(cardEl, value, thresholds) {
    if (!cardEl) return;
    thresholds = thresholds || { good: 80, moderate: 60 };
    var num = parseFloat(value);
    if (isNaN(num)) { cardEl.removeAttribute('data-status'); return; }
    if (num >= thresholds.good) cardEl.setAttribute('data-status', 'good');
    else if (num >= thresholds.moderate) cardEl.setAttribute('data-status', 'moderate');
    else cardEl.setAttribute('data-status', 'low');
  }

  function updateTimestamp(id) {
    var el = document.getElementById(id);
    if (el) el.textContent = 'Updated ' + UI.timeAgo(new Date());
  }

  // ── SKELETON LOADERS ────────────────────────────────────────────────────
  function showDashboardSkeletons() {
    // Stat cards
    ['totalStudents', 'attendanceRate', 'totalStreams', 'parentEngagement'].forEach(function (id) {
      UI.showStatSkeleton(id);
    });

    // Today's Overview
    var todayEl = document.getElementById('todayClasses');
    if (todayEl) {
      UI.showSkeleton('todayClasses', 3, 3);
    }

    // Top performers
    var perfEl = document.getElementById('topPerformers');
    if (perfEl) {
      UI.showSkeleton('topPerformers', 5, 2);
    }

    // Alerts
    var alertEl = document.getElementById('alertsContainer');
    if (alertEl) {
      UI.showSkeleton('alertsContainer', 3, 2);
    }

    // Today snapshot
    ['todayPresent', 'todayAbsent', 'todayRate', 'classesMarked'].forEach(function (id) {
      setVal(id, '...');
    });
  }

  // ── CHART INITIALIZATION ────────────────────────────────────────────────
  function initCharts() {
    var barEl = document.getElementById('attendanceChart');
    if (barEl) {
      if (attendanceChart) attendanceChart.destroy();
      attendanceChart = new Chart(barEl, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{
            label: 'Attendance',
            data: [],
            backgroundColor: function (ctx) {
              var v = ctx.raw || 0;
              if (v >= 90) return 'rgba(52,211,153,0.7)';
              if (v >= 75) return 'rgba(251,191,36,0.7)';
              return 'rgba(248,113,113,0.7)';
            },
            borderRadius: 5,
            borderSkipped: false,
            barPercentage: 0.6,
            categoryPercentage: 0.8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 500, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#1A1A1D',
              titleColor: '#E8E8EC',
              bodyColor: '#E8E8EC',
              borderColor: 'rgba(255,255,255,0.06)',
              borderWidth: 1,
              padding: 10,
              cornerRadius: 8,
              displayColors: false,
              titleFont: { size: 10, family: 'Inter' },
              bodyFont: { size: 13, weight: '700', family: 'Inter' },
              callbacks: { label: function (c) { return c.parsed.y + '%'; } }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: { color: '#4E4E56', font: { size: 10, family: 'Inter' }, stepSize: 25, callback: function (v) { return v + '%'; } },
              grid: { color: 'rgba(255,255,255,0.03)', drawBorder: false }
            },
            x: {
              ticks: { color: '#4E4E56', font: { size: 9, family: 'Inter' }, maxRotation: 45 },
              grid: { display: false }
            }
          }
        }
      });
    }

    var dEl = document.getElementById('streamChart');
    if (dEl) {
      if (streamChart) streamChart.destroy();
      streamChart = new Chart(dEl, {
        type: 'doughnut',
        data: {
          labels: [],
          datasets: [{
            data: [],
            backgroundColor: [
              'rgba(167,139,250,0.7)', 'rgba(52,211,153,0.7)', 'rgba(251,191,36,0.7)',
              'rgba(248,113,113,0.7)', 'rgba(96,165,250,0.7)', 'rgba(236,72,153,0.7)',
              'rgba(6,182,212,0.7)', 'rgba(139,92,246,0.7)'
            ],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          animation: { duration: 500 },
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                padding: 6,
                font: { size: 9, family: 'Inter' },
                color: '#8A8A92',
                usePointStyle: true,
                pointStyle: 'circle',
                boxWidth: 6,
                boxHeight: 6
              }
            },
            tooltip: {
              backgroundColor: '#1A1A1D',
              padding: 8,
              cornerRadius: 6,
              titleFont: { family: 'Inter', size: 10 },
              bodyFont: { family: 'Inter', size: 11, weight: '600' }
            }
          }
        }
      });
    }
  }

  // ── CHART PERIOD SWITCH ─────────────────────────────────────────────────
  function setChartPeriod(period) {
    currentPeriod = period;
    document.querySelectorAll('.chip').forEach(function (b) {
      b.classList.toggle('active', b.dataset.period === period);
    });
    loadAttendanceTrend(period);
  }

  async function loadAttendanceTrend(period) {
    try {
      var data = await AppAPI.dashboard.trend(period);
      if (data.success && data.trend && attendanceChart) {
        attendanceChart.data.labels = data.trend.labels || [];
        attendanceChart.data.datasets[0].data = data.trend.data || [];
        attendanceChart.update('none');
      }
    } catch (e) {
      console.error('[Dashboard] Trend error:', e);
    }
  }

  // ── TODAY'S CLASSES RENDERING ────────────────────────────────────────────
  function renderTodayClasses(todayOverview, topPerformers) {
    var el = document.getElementById('todayClasses');
    if (!el) return;

    var items = [];
    if (todayOverview) {
      var rate = todayOverview.rate || 0;
      var severity = rate >= 80 ? 'low' : rate >= 60 ? 'medium' : 'high';
      var status = rate >= 80 ? 'On Track' : rate >= 60 ? 'Needs Attention' : 'Critical';
      items.push({
        time: (todayOverview.classesMarked || 0) + ' classes marked',
        title: 'Today\'s attendance: ' + (todayOverview.present || 0) + ' present, ' + (todayOverview.absent || 0) + ' absent',
        tags: [
          { label: severity === 'high' ? 'Low' : severity === 'medium' ? 'Medium' : 'Good', type: severity },
          { label: status, type: 'in-progress' },
          { label: rate + '% rate', type: 'neutral' }
        ],
        present: todayOverview.present || 0,
        absent: todayOverview.absent || 0
      });
    }

    if (topPerformers && topPerformers.length > 0) {
      var top = topPerformers[0];
      items.push({
        time: 'Best performer overall',
        title: (top.label || top.stream + ' - Sem ' + top.semester) + ' at ' + top.rate + '%',
        tags: [
          { label: 'Top', type: 'low' },
          { label: top.sessions + ' sessions', type: 'neutral' }
        ],
        sessions: top.sessions
      });
    }

    if (items.length === 0) {
      el.innerHTML = '<div class="empty-state">No classes recorded today</div>';
      return;
    }

    el.innerHTML = items.map(function (item) {
      return '<div class="day-item">' +
        '<div class="day-item-top">' +
          '<div class="day-time"><span class="material-symbols-rounded">schedule</span> ' + item.time + '</div>' +
          '<div class="day-stats"><span><span class="material-symbols-rounded">person</span> ' + (item.present || item.sessions || 0) + '</span></div>' +
        '</div>' +
        '<div class="day-title">' + item.title + '</div>' +
        '<div class="day-tags">' + item.tags.map(function (t) {
          return '<span class="tag ' + t.type + '"><span class="tag-dot"></span>' + t.label + '</span>';
        }).join('') + '</div>' +
      '</div>';
    }).join('');
  }

  // ── CLASSES LIST ────────────────────────────────────────────────────────
  var CLASSES_INITIAL = 5;
  window._allClasses = [];
  window._classSort = 'best';
  window._classesExpanded = false;

  function renderClassesList() {
    var tp = document.getElementById('topPerformers');
    var btn = document.getElementById('seeMoreBtn');
    if (!tp) return;

    var all = window._allClasses || [];
    if (all.length === 0) {
      tp.innerHTML = '<div class="empty-state">No data</div>';
      if (btn) btn.style.display = 'none';
      return;
    }

    var sorted = all.slice();
    if (window._classSort === 'worst') sorted.sort(function (a, b) { return a.rate - b.rate; });
    else sorted.sort(function (a, b) { return b.rate - a.rate; });

    var expanded = window._classesExpanded;
    var visible = expanded ? sorted : sorted.slice(0, CLASSES_INITIAL);

    tp.innerHTML = visible.map(function (item, i) {
      var pctCls = item.rate >= 85 ? 'hi' : item.rate >= 70 ? 'md' : 'lo';
      var avatarCls = '';
      if (window._classSort === 'best') {
        if (i === 0) avatarCls = 'gold';
        else if (i === 1) avatarCls = 'silver';
        else if (i === 2) avatarCls = 'bronze';
      }

      // Trend arrow
      var trendArrow = '';
      if (item.trend !== undefined && item.trend !== null) {
        if (item.trend > 0) trendArrow = ' <span style="color:var(--green);font-size:10px;">↑</span>';
        else if (item.trend < 0) trendArrow = ' <span style="color:var(--red);font-size:10px;">↓</span>';
        else trendArrow = ' <span style="color:var(--text-muted);font-size:10px;">→</span>';
      }

      return '<div class="team-row">' +
        '<div class="team-avatar ' + avatarCls + '">' + (i + 1) + '</div>' +
        '<div class="team-info">' +
          '<div class="team-name">' + (item.label || item.stream + ' Sem ' + item.semester) + '</div>' +
          '<div class="team-sub">' + item.sessions + ' sessions' + trendArrow + '</div>' +
        '</div>' +
        '<div class="team-rate ' + pctCls + '">' + item.rate + '%</div>' +
      '</div>';
    }).join('');

    if (btn) {
      if (sorted.length > CLASSES_INITIAL) {
        btn.style.display = 'flex';
        var txt = document.getElementById('seeMoreText');
        var ico = btn.querySelector('.material-symbols-rounded');
        if (expanded) {
          if (txt) txt.textContent = 'See less';
          if (ico) ico.textContent = 'expand_less';
        } else {
          if (txt) txt.textContent = 'See all ' + sorted.length + ' classes';
          if (ico) ico.textContent = 'expand_more';
        }
      } else {
        btn.style.display = 'none';
      }
    }
  }

  // ── MAIN DATA LOAD ──────────────────────────────────────────────────────
  async function loadDashboardData() {
    showDashboardSkeletons();

    try {
      // Fire all requests simultaneously
      var results = await Promise.all([
        AppAPI.dashboard.stats(),
        AppAPI.dashboard.trend(currentPeriod)
      ]);

      var statsData = results[0];
      var trendData = results[1];

      lastFetchTime = new Date();

      if (statsData.success && statsData.stats) {
        var s = statsData.stats;

        // Stat cards
        setVal('totalStudents', s.totalStudents || 0);
        setVal('totalStreams', s.totalStreams || 0);
        setVal('attendanceRate', (s.attendanceRate || 0) + '%');
        setVal('parentEngagement', (s.parentEngagement || 0) + '%');

        // Set colored left borders based on values
        var statCards = document.querySelectorAll('.stat-card');
        if (statCards[0]) setStatStatus(statCards[0], s.totalStudents, { good: 100, moderate: 50 });
        if (statCards[1]) setStatStatus(statCards[1], s.attendanceRate, { good: 80, moderate: 60 });
        if (statCards[2]) setStatStatus(statCards[2], s.totalStreams, { good: 3, moderate: 1 });
        if (statCards[3]) setStatStatus(statCards[3], s.parentEngagement, { good: 50, moderate: 20 });

        // Update timestamps
        document.querySelectorAll('.stat-updated').forEach(function (el) {
          el.textContent = 'Updated ' + UI.timeAgo(lastFetchTime);
        });

        // Parent App 0% tooltip
        if (s.parentEngagement === 0 || s.parentEngagement === '0') {
          var peEl = document.getElementById('parentEngagement');
          if (peEl) {
            peEl.parentElement.insertAdjacentHTML('beforeend',
              '<div class="stat-updated" style="display:flex;align-items:center;gap:4px;">' +
                '<span class="material-symbols-rounded" style="font-size:12px;color:var(--amber);">info</span>' +
                '<span style="font-size:10px;color:var(--text-muted);">No parents registered yet</span>' +
              '</div>'
            );
          }
        }

        // Today
        if (s.todayOverview) {
          var t = s.todayOverview;
          setVal('todayPresent', t.present || 0);
          setVal('todayAbsent', t.absent || 0);
          setVal('todayRate', (t.rate || 0) + '%');
          setVal('classesMarked', t.classesMarked || 0);
          var badge = document.getElementById('classesMarkedBadge');
          if (badge) badge.textContent = (t.classesMarked || 0) + ' classes';
          var sbP = document.getElementById('sbPresent');
          var sbA = document.getElementById('sbAbsent');
          if (sbP) sbP.textContent = (t.present || 0) + ' Present';
          if (sbA) sbA.textContent = (t.absent || 0) + ' Absent';
        }

        // Weekly
        if (s.weeklyComparison) {
          var w = s.weeklyComparison;
          setVal('thisWeekRate', (w.thisWeek || 0) + '%');
          setVal('lastWeekRate', (w.lastWeek || 0) + '%');
          setVal('thisWeekSessions', (w.thisWeekSessions || 0) + ' sessions');
          setVal('lastWeekSessions', (w.lastWeekSessions || 0) + ' sessions');
          var tb = document.getElementById('weeklyTrendBadge');
          if (tb) {
            var tr = w.trend || 0;
            if (tr > 0) { tb.style.background = 'var(--green-dim)'; tb.style.color = 'var(--green)'; tb.innerHTML = '↑ +' + tr + '% from last week'; }
            else if (tr < 0) { tb.style.background = 'var(--red-dim)'; tb.style.color = 'var(--red)'; tb.innerHTML = '↓ ' + tr + '% from last week'; }
            else { tb.style.background = 'rgba(255,255,255,0.03)'; tb.style.color = 'var(--text-muted)'; tb.innerHTML = '→ No change'; }
          }
        }

        // Classes list
        window._allClasses = s.topPerformers || [];
        renderClassesList();
        var cc = document.getElementById('classesCount');
        if (cc) cc.textContent = '(' + window._allClasses.length + ')';

        // Alerts
        var ac = document.getElementById('alertsContainer');
        if (ac && s.alerts) {
          if (s.alerts.length === 0) {
            ac.innerHTML = '<div class="empty-state" style="padding:24px;">' +
              '<span class="material-symbols-rounded" style="font-size:24px;color:var(--green);display:block;margin-bottom:6px;">check_circle</span>All clear</div>';
          } else {
            var iconMap = { warning: 'warn', alert: 'err', success: 'ok', info: 'info' };
            var matMap = { warning: 'warning', alert: 'error', success: 'check_circle', info: 'info' };
            ac.innerHTML = s.alerts.map(function (a) {
              return '<div class="mention-row">' +
                '<div class="mention-dot ' + (iconMap[a.type] || 'info') + '"><span class="material-symbols-rounded">' + (matMap[a.type] || 'info') + '</span></div>' +
                '<div class="mention-body"><div class="mention-title">' + a.title + '</div><div class="mention-desc">' + a.description + '</div></div>' +
              '</div>';
            }).join('');
          }
        }

        // Today's Classes
        renderTodayClasses(s.todayOverview, s.topPerformers);

        // Charts
        if (s.charts) {
          initCharts();
          if (streamChart && s.charts.streamDistribution) {
            streamChart.data.labels = s.charts.streamDistribution.labels || [];
            streamChart.data.datasets[0].data = s.charts.streamDistribution.data || [];
            streamChart.update();
          }
        }
      }

      // Trend chart from second request
      if (trendData.success && trendData.trend && attendanceChart) {
        attendanceChart.data.labels = trendData.trend.labels || [];
        attendanceChart.data.datasets[0].data = trendData.trend.data || [];
        attendanceChart.update();
      } else if (!attendanceChart) {
        initCharts();
        if (trendData.success && trendData.trend && attendanceChart) {
          attendanceChart.data.labels = trendData.trend.labels || [];
          attendanceChart.data.datasets[0].data = trendData.trend.data || [];
          attendanceChart.update();
        }
      }

    } catch (e) {
      console.error('[Dashboard] Load error:', e);
      setVal('totalStudents', '0');
      setVal('totalStreams', '0');
      setVal('attendanceRate', '0%');
      setVal('parentEngagement', '0%');
      var ac = document.getElementById('alertsContainer');
      if (ac) {
        ac.innerHTML = '<div class="empty-state" style="color:var(--red);"><span class="material-symbols-rounded" style="font-size:22px;display:block;margin-bottom:6px;">error</span>' + e.message + '</div>';
      }
    }
  }

  // ── AUTO REFRESH (every 5 minutes) ──────────────────────────────────────
  function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(function () {
      AppAPI.invalidateCache('/dashboard');
      loadDashboardData();
    }, 300000); // 5 minutes
  }

  // ── EVENT HANDLERS ──────────────────────────────────────────────────────
  function filterClasses(mode) {
    window._classSort = mode;
    window._classesExpanded = false;
    var bestBtn = document.getElementById('filterBest');
    var worstBtn = document.getElementById('filterWorst');
    if (bestBtn) bestBtn.classList.toggle('active', mode === 'best');
    if (worstBtn) worstBtn.classList.toggle('active', mode === 'worst');
    renderClassesList();
  }

  function toggleSeeMore() {
    window._classesExpanded = !window._classesExpanded;
    renderClassesList();
  }

  function updateCurrentDate() {
    var el = document.getElementById('currentDate');
    if (el) {
      el.textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }

  // ── INITIALIZATION ──────────────────────────────────────────────────────
  function init(user) {
    updateCurrentDate();
    loadDashboardData();
    startAutoRefresh();
  }

  // ── GLOBAL EXPORTS ──────────────────────────────────────────────────────
  window.loadDashboardData = init;
  window.setChartPeriod = setChartPeriod;
  window.filterClasses = filterClasses;
  window.toggleSeeMore = toggleSeeMore;

})();
