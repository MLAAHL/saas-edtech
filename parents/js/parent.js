const API = window.APP_CONFIG.API_BASE_URL;
let currentStudent = null;

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function goBack() { currentStudent = null; showScreen('loginScreen'); }

// ===== STUDENT LOOKUP =====
document.getElementById('lookupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const sid = document.getElementById('studentIDInput').value.trim();
  if (!sid) return;
  const btn = document.getElementById('lookupBtn');
  const txt = document.getElementById('lookupText');
  const spin = document.getElementById('lookupSpinner');
  const err = document.getElementById('loginError');
  txt.textContent = 'Searching...'; spin.classList.remove('hidden'); btn.disabled = true; err.classList.add('hidden');

  try {
    const res = await fetch(`${API}/parent/lookup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentID: sid })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Student not found');
    currentStudent = data.student;

    document.getElementById('studentName').textContent = currentStudent.name;
    document.getElementById('studentMeta').textContent = `${currentStudent.stream} \u00B7 Semester ${currentStudent.semester}`;

    showScreen('dashboardScreen');
    setTodayDate();
    switchTab('daily');
  } catch (error) {
    err.textContent = error.message; err.classList.remove('hidden');
  } finally {
    txt.textContent = 'Search Student'; spin.classList.add('hidden'); btn.disabled = false;
  }
});

// ===== TABS =====
function switchTab(tab) {
  document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
  document.querySelector(`.nav-item[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tab + 'Tab').classList.add('active');
  if (tab === 'daily') loadDailyAttendance();
  else if (tab === 'full') loadFullAttendance();
  else if (tab === 'recent') loadRecentAttendance();
}

// ===== DATE =====
function setTodayDate() {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('dailyDate').value = today;
  updateDateLabel();
}
function updateDateLabel() {
  const val = document.getElementById('dailyDate').value;
  document.getElementById('dateLabel').textContent = formatDate(val);
}
function changeDate(delta) {
  const input = document.getElementById('dailyDate');
  const d = new Date(input.value); d.setDate(d.getDate() + delta);
  input.value = d.toISOString().split('T')[0];
  updateDateLabel();
  loadDailyAttendance();
}
function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}
function getPercentClass(p) { return p >= 90 ? 'excellent' : p >= 75 ? 'good' : p >= 60 ? 'avg' : 'low'; }
function showLoading() { document.getElementById('loadingOverlay').classList.remove('hidden'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.add('hidden'); }

// ===== DAILY =====
async function loadDailyAttendance() {
  if (!currentStudent) return;
  const date = document.getElementById('dailyDate').value;
  showLoading();
  try {
    const res = await fetch(`${API}/parent/daily/${currentStudent.studentID}?date=${date}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const s = data.summary;
    document.getElementById('dailySummaryCard').innerHTML = `
      <div class="summary-card">
        <p class="summary-label">${formatDate(data.date)}</p>
        <div class="big-percent">${s.percentage}%</div>
        <div class="summary-row">
          <div class="stat-pill"><span class="material-symbols-rounded">check_circle</span> ${s.present} Present</div>
          <div class="stat-pill"><span class="material-symbols-rounded">cancel</span> ${s.absent} Absent</div>
          <div class="stat-pill"><span class="material-symbols-rounded">menu_book</span> ${s.totalClasses} Classes</div>
        </div>
      </div>`;
    const list = document.getElementById('dailyList');
    if (data.attendance.length === 0) {
      list.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">event_busy</span><p>No classes recorded for this date</p></div>`;
    } else {
      list.innerHTML = data.attendance.map(a => `
        <div class="record-card">
          <div class="rc-top"><span class="rc-subject">${a.subject}</span><span class="rc-time">${a.time || ''}</span></div>
          <div class="rc-bottom"><span class="status-badge ${a.isPresent ? 'present' : 'absent'}">${a.status}</span></div>
        </div>`).join('');
    }
  } catch (err) {
    document.getElementById('dailyList').innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">error</span><p>${err.message}</p></div>`;
  } finally { hideLoading(); }
}

// ===== FULL =====
async function loadFullAttendance() {
  if (!currentStudent) return; showLoading();
  try {
    const res = await fetch(`${API}/parent/full/${currentStudent.studentID}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const o = data.overall;
    document.getElementById('overallSummary').innerHTML = `
      <div class="summary-card">
        <p class="summary-label">Overall Attendance</p>
        <div class="big-percent">${o.percentage}%</div>
        <div class="summary-row">
          <div class="stat-pill"><span class="material-symbols-rounded">check_circle</span> ${o.present} Present</div>
          <div class="stat-pill"><span class="material-symbols-rounded">cancel</span> ${o.absent} Absent</div>
          <div class="stat-pill"><span class="material-symbols-rounded">menu_book</span> ${o.totalClasses} Total</div>
        </div>
      </div>`;
    const list = document.getElementById('subjectList');
    if (data.subjectWise.length === 0) {
      list.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">menu_book</span><p>No records found</p></div>`;
    } else {
      list.innerHTML = data.subjectWise.map(s => {
        const cls = getPercentClass(s.percentage);
        return `<div class="record-card">
          <div class="rc-top"><span class="rc-subject">${s.subject}</span><span class="percent-text ${cls}">${s.percentage}%</span></div>
          <div class="progress-bar"><div class="progress-fill ${cls}" style="width:${s.percentage}%"></div></div>
          <div class="rc-bottom" style="margin-top:4px"><span class="rc-time">Present: ${s.present}/${s.totalClasses}</span><span class="rc-time">Absent: ${s.absent}</span></div>
        </div>`;
      }).join('');
    }
  } catch (err) {
    document.getElementById('subjectList').innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">error</span><p>${err.message}</p></div>`;
  } finally { hideLoading(); }
}

// ===== RECENT =====
async function loadRecentAttendance() {
  if (!currentStudent) return; showLoading();
  try {
    const res = await fetch(`${API}/parent/recent/${currentStudent.studentID}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const list = document.getElementById('recentList');
    if (data.recent.length === 0) {
      list.innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">schedule</span><p>No recent attendance found</p></div>`;
    } else {
      list.innerHTML = data.recent.map(day => {
        const pct = day.total > 0 ? Math.round((day.present/day.total)*100) : 0;
        const pc = getPercentClass(pct);
        return `<div class="day-card">
          <div class="day-header"><span class="day-date">${formatDate(day.date)}</span><span class="percent-text ${pc}">${pct}%</span></div>
          <div class="day-summary">${day.present}/${day.total} classes attended</div>
          <div class="day-classes">${day.classes.map(c => `
            <div class="day-class"><span>${c.subject}</span><span class="status-badge ${c.isPresent ? 'present' : 'absent'}">${c.isPresent ? 'Present' : 'Absent'}</span></div>`).join('')}
          </div></div>`;
      }).join('');
    }
  } catch (err) {
    document.getElementById('recentList').innerHTML = `<div class="empty-state"><span class="material-symbols-rounded">error</span><p>${err.message}</p></div>`;
  } finally { hideLoading(); }
}
