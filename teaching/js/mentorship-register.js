// The mentoring register.
//
// Deliberately its own screen rather than a stream in View Attendance: a
// mentoring group is not a class. Its roll is the signed-in teacher's mentee
// list, which for some mentors spans eleven different stream/semester pairs,
// and 22 mentors file into the same synthetic class — so the sessions shown
// here are scoped to this mentor alone.

const API = window.APP_CONFIG.API_BASE_URL + '/mentorship-attendance';

let register = null;

async function authHeaders() {
  const headers = {};
  try {
    const auth = window.firebaseAuth;
    if (auth && auth.currentUser) {
      headers['Authorization'] = 'Bearer ' + (await auth.currentUser.getIdToken());
    }
  } catch (e) {
    console.error('Token error:', e);
  }
  return headers;
}

function toast(message, kind) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'show' + (kind ? ' ' + kind : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.className = ''; }, 3200);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// "2026-08-01" -> "01/08" for a column head that has to stay narrow.
function shortDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}` : esc(iso);
}

// "2026-08-01" -> "Sat, Aug 2026" under the column number. Parsed by hand
// because new Date("2026-08-01") is UTC and can slip a day westward.
function longDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', year: 'numeric' });
}

function setMessage(icon, text) {
  const el = document.getElementById('msg');
  el.innerHTML = `<span class="material-symbols-rounded">${icon}</span>${esc(text)}`;
  el.classList.remove('hidden');
}

function render() {
  const { sessions, students } = register;
  const host = document.getElementById('tableHost');

  if (!sessions.length) {
    host.innerHTML = '';
    document.getElementById('summaryCard').classList.add('hidden');
    setMessage('event_busy', 'No mentoring sessions recorded yet. Take one from the Mentees screen.');
    return;
  }

  document.getElementById('msg').classList.add('hidden');
  document.getElementById('summaryCard').classList.remove('hidden');

  const held = students.filter(s => s.sessionsHeld > 0);
  const avg = held.length
    ? Math.round(held.reduce((n, s) => n + s.attendancePercentage, 0) / held.length)
    : 0;
  document.getElementById('sSessions').textContent = sessions.length;
  document.getElementById('sStudents').textContent = students.length;
  document.getElementById('sAvg').textContent = avg + '%';
  document.getElementById('sLow').textContent = held.filter(s => s.attendancePercentage < 75).length;

  // Date only — a mentoring session is not a timetabled period, so there is no
  // honest time to put here.
  const head = sessions.map(s => `
    <th><div class="d">${shortDate(s.date)}</div>${esc(longDate(s.date))}</th>`).join('');

  const rows = students.map((s, i) => {
    const cells = s.attendance.map(a => {
      const cls = a.status === 'P' ? 'p' : a.status === 'A' ? 'a' : 'n';
      // "-" marks a session held before this student joined the mentor's list,
      // so it is not counted as an absence anywhere.
      return `<td><span class="mark ${cls}">${a.status}</span></td>`;
    }).join('');
    const meta = s.stream ? `${esc(s.stream)}${s.semester != null ? ' · Sem ' + s.semester : ''}` : '';
    return `
      <tr data-search="${esc((s.name + ' ' + s.studentID).toLowerCase())}">
        <td class="col-idx">${i + 1}</td>
        <td class="col-name">
          <div class="nm">${esc(s.name)}</div>
          ${meta ? `<div class="meta">${meta}</div>` : ''}
        </td>
        <td class="col-id">${esc(s.studentID)}</td>
        ${cells}
        <td class="num p">${s.presentCount}</td>
        <td class="num a">${s.absentCount}</td>
        <td class="pct ${s.attendancePercentage < 75 ? 'low' : ''}">${s.attendancePercentage}%</td>
      </tr>`;
  }).join('');

  host.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th class="col-idx">#</th>
            <th class="col-name">Name</th>
            <th style="text-align:left;">Student ID</th>
            ${head}
            <th>Present</th>
            <th>Absent</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function applySearch() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  document.querySelectorAll('tbody tr').forEach(tr => {
    tr.classList.toggle('row-hidden', q && !tr.dataset.search.includes(q));
  });
}

// Excel opens a plain CSV without complaint, which avoids shipping a library
// for what is one table.
function exportCsv() {
  if (!register || !register.sessions.length) return;
  const rows = [
    ['#', 'Name', 'Student ID', 'Class',
     ...register.sessions.map(s => s.date),
     'Present', 'Absent', '%']
  ];
  register.students.forEach((s, i) => {
    rows.push([
      i + 1, s.name, s.studentID,
      s.stream ? s.stream + (s.semester != null ? ' Sem ' + s.semester : '') : '',
      ...s.attendance.map(a => a.status),
      s.presentCount, s.absentCount, s.attendancePercentage + '%'
    ]);
  });

  const csv = rows.map(r => r.map(v => {
    const cell = String(v == null ? '' : v);
    return /[",\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
  }).join(',')).join('\r\n');

  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `mentoring-register-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Register exported');
}

async function load() {
  try {
    const res = await fetch(`${API}/register`, { headers: await authHeaders() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    if (!data.success) throw new Error(data.error || 'Could not load the register');

    if (!data.isMentor) {
      document.getElementById('sub').textContent = 'Not a mentor';
      setMessage('diversity_3', 'You do not have any mentees assigned yet.');
      return;
    }

    register = data;
    document.getElementById('sub').textContent =
      `${data.totalStudents} mentee${data.totalStudents === 1 ? '' : 's'} · ` +
      `${data.totalSessions} session${data.totalSessions === 1 ? '' : 's'}`;
    render();
  } catch (error) {
    console.error('Register load failed:', error);
    document.getElementById('sub').textContent = 'Could not load';
    setMessage('error', 'Could not load the register. Pull down to retry.');
    toast('Could not load the register', 'err');
  }
}

document.getElementById('search').addEventListener('input', applySearch);
document.getElementById('exportBtn').addEventListener('click', exportCsv);

window.addEventListener('mentorship:ready', load);
