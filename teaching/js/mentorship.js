// Mentorship attendance.
//
// The roster comes from the signed-in teacher's mentee list, not from a
// stream/semester pair, so a mentor who holds one whole class and a mentor
// whose mentees are spread across ten classes both use this same screen. The
// only difference is how many collapsible groups they see.

const API = window.APP_CONFIG.API_BASE_URL + '/mentorship-attendance';

let groups = [];              // [{ stream, semester, students: [...] }]
let present = new Set();      // studentIDs marked present
let totalStudents = 0;
let existingSession = null;   // set when a session already exists for the date
let submitting = false;

// Firebase ID tokens last an hour, so fetch one per request and let the SDK
// refresh it rather than reusing a token captured at page load.
async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
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

function todayISO() {
  const d = new Date();
  return [d.getFullYear(),
          String(d.getMonth() + 1).padStart(2, '0'),
          String(d.getDate()).padStart(2, '0')].join('-');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ---------- rendering ----------

function renderGroups() {
  const host = document.getElementById('groups');
  host.innerHTML = groups.map((g, gi) => {
    const label = g.semester != null ? `${esc(g.stream)} · Sem ${g.semester}` : esc(g.stream);
    const rows = g.students.map(s => `
      <div class="student" data-id="${esc(s.studentID)}"
           data-search="${esc((s.name + ' ' + s.studentID).toLowerCase())}">
        <div class="tick"><span class="material-symbols-rounded">check</span></div>
        <div class="nm">${esc(s.name)}</div>
        <div class="sid">${esc(s.studentID)}</div>
      </div>`).join('');

    return `
      <div class="group" data-group="${gi}">
        <div class="group-head">
          <span class="material-symbols-rounded chev">expand_more</span>
          <span class="title">${label}</span>
          <span class="count" data-count="${gi}">0/${g.students.length}</span>
          <button class="mark-all" data-markall="${gi}">All</button>
        </div>
        <div class="group-body">${rows}</div>
      </div>`;
  }).join('');

  // A mentor with a single class shouldn't have to expand anything; a mentor
  // with many groups gets them collapsed so the page stays scannable.
  if (groups.length > 3) {
    host.querySelectorAll('.group').forEach(el => el.classList.add('collapsed'));
  }

  host.querySelectorAll('.student').forEach(el => {
    el.addEventListener('click', () => toggleStudent(el.dataset.id));
  });
  host.querySelectorAll('[data-markall]').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      markGroup(parseInt(btn.dataset.markall, 10));
    });
  });
  host.querySelectorAll('.group-head').forEach(head => {
    head.addEventListener('click', () => head.parentElement.classList.toggle('collapsed'));
  });
}

function paint() {
  document.querySelectorAll('.student').forEach(el => {
    el.classList.toggle('present', present.has(el.dataset.id));
  });

  groups.forEach((g, gi) => {
    const n = g.students.filter(s => present.has(s.studentID)).length;
    const badge = document.querySelector(`[data-count="${gi}"]`);
    if (badge) badge.textContent = `${n}/${g.students.length}`;
  });

  const p = present.size;
  document.getElementById('statTotal').textContent = totalStudents;
  document.getElementById('statPresent').textContent = p;
  document.getElementById('statAbsent').textContent = totalStudents - p;
  document.getElementById('barPresent').textContent = p;
  document.getElementById('barTotal').textContent = totalStudents;
}

function toggleStudent(id) {
  if (present.has(id)) present.delete(id); else present.add(id);
  paint();
}

function markGroup(gi) {
  const g = groups[gi];
  if (!g) return;
  const allOn = g.students.every(s => present.has(s.studentID));
  g.students.forEach(s => { if (allOn) present.delete(s.studentID); else present.add(s.studentID); });
  paint();
}

function applySearch(term) {
  const q = term.trim().toLowerCase();
  document.querySelectorAll('.student').forEach(el => {
    el.classList.toggle('hidden', q !== '' && !el.dataset.search.includes(q));
  });
  // Expand groups while searching so matches aren't hidden inside a collapsed one.
  if (q !== '') document.querySelectorAll('.group').forEach(el => el.classList.remove('collapsed'));
}

// ---------- data ----------

async function loadRoster() {
  try {
    const res = await fetch(API + '/roster', { headers: await authHeaders() });
    const data = await res.json();

    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);

    document.getElementById('loadingState').classList.add('hidden');

    if (!data.groups || data.groups.length === 0) {
      document.getElementById('emptyState').classList.remove('hidden');
      document.getElementById('emptyText').textContent =
        data.message || 'You do not have any mentees assigned yet.';
      document.getElementById('mentorSub').textContent = data.mentorName || '';
      return;
    }

    groups = data.groups;
    totalStudents = data.totalStudents;

    const classCount = groups.length;
    document.getElementById('mentorSub').textContent =
      `${totalStudents} mentee${totalStudents === 1 ? '' : 's'} · ` +
      `${classCount} class${classCount === 1 ? '' : 'es'}`;

    if (data.missingMentees && data.missingMentees.length) {
      const box = document.getElementById('missingNote');
      box.classList.remove('hidden');
      box.textContent = `${data.missingMentees.length} student(s) on your list no longer exist in the ` +
        `records and are not shown: ${data.missingMentees.slice(0, 6).join(', ')}` +
        (data.missingMentees.length > 6 ? '…' : '') + '. Ask the office to update your mentee list.';
    }

    document.getElementById('main').classList.remove('hidden');
    document.getElementById('submitBar').classList.remove('hidden');

    renderGroups();
    paint();
    await loadSession(document.getElementById('sessionDate').value);
  } catch (err) {
    console.error(err);
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('emptyText').textContent = 'Could not load your mentees: ' + err.message;
  }
}

// If a session already exists for the chosen date, load it so the mentor edits
// rather than unknowingly overwrites it.
async function loadSession(date) {
  const note = document.getElementById('existingNote');
  const submitText = document.getElementById('submitText');
  try {
    const res = await fetch(`${API}/session/${encodeURIComponent(date)}`, { headers: await authHeaders() });
    const data = await res.json();
    existingSession = (data && data.success) ? data.session : null;
  } catch {
    existingSession = null;
  }

  present = new Set();

  if (existingSession) {
    (existingSession.studentsPresent || []).forEach(id => present.add(id));
    note.classList.remove('hidden');
    note.textContent = `Attendance for this date was already recorded ` +
      `(${existingSession.presentCount} present, ${existingSession.absentCount} absent). ` +
      `Submitting again will update it.`;
    submitText.textContent = 'Update Attendance';
  } else {
    note.classList.add('hidden');
    submitText.textContent = 'Submit Attendance';
  }
  paint();
}

async function submit() {
  if (submitting) return;
  const date = document.getElementById('sessionDate').value;
  if (!date) { toast('Pick a session date first', 'err'); return; }

  const absent = totalStudents - present.size;
  const verb = existingSession ? 'Update' : 'Submit';
  if (!confirm(`${verb} mentorship attendance for ${date}?\n\n` +
               `Present: ${present.size}\nAbsent: ${absent}\n\n` +
               `Parents are not notified for mentorship sessions.`)) return;

  submitting = true;
  const btn = document.getElementById('submitBtn');
  const label = document.getElementById('submitText');
  const original = label.textContent;
  btn.disabled = true;
  label.textContent = 'Saving…';

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ date, studentsPresent: Array.from(present) })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);

    toast(data.message || 'Saved', 'ok');
    await loadSession(date);
  } catch (err) {
    console.error(err);
    toast('Could not save: ' + err.message, 'err');
    label.textContent = original;
  } finally {
    submitting = false;
    btn.disabled = false;
  }
}

// ---------- wiring ----------

function init() {
  const dateInput = document.getElementById('sessionDate');
  dateInput.value = todayISO();
  dateInput.max = todayISO();

  dateInput.addEventListener('change', () => loadSession(dateInput.value));
  document.getElementById('searchBox').addEventListener('input', e => applySearch(e.target.value));
  document.getElementById('allPresentBtn').addEventListener('click', () => {
    groups.forEach(g => g.students.forEach(s => present.add(s.studentID)));
    paint();
  });
  document.getElementById('clearBtn').addEventListener('click', () => { present = new Set(); paint(); });
  document.getElementById('submitBtn').addEventListener('click', submit);

  loadRoster();
}

window.addEventListener('mentorship:ready', init, { once: true });
