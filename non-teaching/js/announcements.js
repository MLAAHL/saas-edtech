// Announcements shown to parents when they open the app.

const API = window.APP_CONFIG.API_BASE_URL;

let uploadedImageUrl = '';
let students = [];          // loaded once, shared by both tabs

async function authHeaders(extra) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, extra || {});
  const user = window.firebaseAuth && window.firebaseAuth.currentUser;
  if (user) headers['Authorization'] = 'Bearer ' + (await user.getIdToken());
  return headers;
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 3000);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function el(id) { return document.getElementById(id); }

// ---------- audience ----------
//
// Both tabs choose who a message is for in the same way, so they run the same
// picker rather than a copy each. Two copies would drift, and the one that
// drifted would be the one deciding who receives a notification.

function makeAudience(ids, opts) {
  const state = { type: opts.initial || 'all', picked: new Set() };

  function matching() {
    if (state.type === 'selected') return students.filter(s => state.picked.has(s.studentID));
    if (state.type === 'all') return students;

    const stream = el(ids.stream).value;
    const sem = el(ids.semester).value;
    return students.filter(s =>
      (stream === 'ALL' || String(s.stream || '').toLowerCase() === stream.toLowerCase()) &&
      (sem === 'ALL' || Number(s.semester) === Number(sem)));
  }

  function refreshReach() {
    const box = el(ids.reach);
    if (!box) return;

    if (!students.length) {
      box.textContent = 'Loading the student list…';
      box.style.color = 'var(--text-muted)';
      return;
    }

    const n = matching().length;
    if (n === 0) {
      // Sending to nobody is always a mistake, so say so rather than let it
      // through and leave the sender wondering why nothing arrived.
      box.textContent = state.type === 'selected'
        ? 'Nobody picked yet — search and tick the students below.'
        : 'No student matches that class, so nobody would get this.';
      box.style.color = 'var(--amber)';
      return;
    }

    box.textContent = opts.reachText(n);
    box.style.color = 'var(--text-muted)';
  }

  function render() {
    const q = (el(ids.search).value || '').trim().toLowerCase();
    const list = el(ids.list);

    // Chosen students stay on top so refining a search never hides them.
    const chosen = students.filter(s => state.picked.has(s.studentID));
    const matches = q
      ? students.filter(s => !state.picked.has(s.studentID) &&
          ((s.name || '').toLowerCase().includes(q) || (s.studentID || '').toLowerCase().includes(q)))
      : [];

    const rows = [...chosen, ...matches.slice(0, 40)];
    list.innerHTML = rows.length
      ? rows.map(s => `
          <div class="pick-row ${state.picked.has(s.studentID) ? 'picked' : ''}" data-id="${esc(s.studentID)}">
            <input type="checkbox" ${state.picked.has(s.studentID) ? 'checked' : ''} tabindex="-1"
                   style="width:auto; margin:0;">
            <span class="pick-name">${esc(s.name || s.studentID)}</span>
            <span class="pick-meta">${esc(s.stream || '')} ${s.semester ? 'Sem ' + s.semester : ''}</span>
          </div>`).join('')
      : `<div style="padding:14px; font-size:12px; color:var(--text-muted);">
           ${q ? 'No student matches that.' : 'Type a name or student ID to find people.'}
         </div>`;

    el(ids.count).textContent = `${state.picked.size} selected`;

    el(ids.chips).innerHTML = chosen.slice(0, 10).map(s => `
        <span class="pick-chip">${esc((s.name || s.studentID).split(' ')[0])}
          <button type="button" data-remove="${esc(s.studentID)}">&times;</button>
        </span>`).join('') +
      (chosen.length > 10 ? `<span class="pick-chip">+${chosen.length - 10} more</span>` : '');

    refreshReach();
  }

  function setType(kind) {
    state.type = kind;
    el(ids.choice).querySelectorAll('.aud-btn').forEach(b =>
      b.classList.toggle('active', b.dataset[ids.dataKey] === kind));
    el(ids.classPanel).style.display = kind === 'class' ? 'block' : 'none';
    el(ids.selectedPanel).style.display = kind === 'selected' ? 'block' : 'none';
    if (kind === 'selected') render();
    refreshReach();
  }

  function wire() {
    el(ids.choice).addEventListener('click', e => {
      const b = e.target.closest('.aud-btn');
      if (b) setType(b.dataset[ids.dataKey]);
    });
    el(ids.search).addEventListener('input', render);
    el(ids.list).addEventListener('click', e => {
      const row = e.target.closest('.pick-row');
      if (!row) return;
      const id = row.dataset.id;
      state.picked.has(id) ? state.picked.delete(id) : state.picked.add(id);
      render();
    });
    el(ids.chips).addEventListener('click', e => {
      const b = e.target.closest('[data-remove]');
      if (!b) return;
      state.picked.delete(b.dataset.remove);
      render();
    });
    el(ids.clear).addEventListener('click', () => {
      state.picked.clear();
      el(ids.search).value = '';
      render();
    });
    [ids.stream, ids.semester].forEach(id => {
      const node = el(id);
      if (node) node.addEventListener('change', refreshReach);
    });
  }

  function fillStreams() {
    const streams = [...new Set(students.map(s => s.stream).filter(Boolean))].sort();
    el(ids.stream).innerHTML = '<option value="ALL">All streams</option>' +
      streams.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  }

  function reset() {
    state.picked.clear();
    el(ids.search).value = '';
    setType(opts.initial || 'all');
  }

  return {
    get type() { return state.type; },
    get picked() { return state.picked; },
    matching, refreshReach, render, setType, wire, fillStreams, reset,

    // What the announcement endpoint expects.
    cardPayload() {
      if (state.type === 'selected') {
        return { audienceType: 'selected', studentIDs: Array.from(state.picked) };
      }
      if (state.type === 'class') {
        return { audienceType: 'class', stream: el(ids.stream).value, semester: el(ids.semester).value };
      }
      return { audienceType: 'all' };
    },

    // What the broadcast endpoint expects — the same choice, different words.
    pushPayload() {
      if (state.type === 'selected') return { studentIDs: Array.from(state.picked) };
      if (state.type === 'class') {
        return { stream: el(ids.stream).value, semester: el(ids.semester).value };
      }
      return { stream: 'ALL', semester: 'ALL' };
    },

    label() {
      if (state.type === 'all') return 'everyone';
      if (state.type === 'selected') return `${state.picked.size} chosen student(s)`;
      const st = el(ids.stream).value;
      const sm = el(ids.semester).value;
      return `${st === 'ALL' ? 'all streams' : st}${sm === 'ALL' ? '' : ' semester ' + sm}`;
    }
  };
}

const cardAud = makeAudience({
  choice: 'audChoice', classPanel: 'audClassPanel', selectedPanel: 'audSelectedPanel',
  stream: 'aStream', semester: 'aSemester', search: 'aPickSearch', list: 'aPickList',
  chips: 'aPickChips', count: 'aPickCount', clear: 'aPickClear', reach: 'audReach',
  dataKey: 'aud'
}, { initial: 'all', reachText: n => `${n} student${n === 1 ? '' : 's'} will see this card.` });

const pushAud = makeAudience({
  choice: 'nAudChoice', classPanel: 'nAudClassPanel', selectedPanel: 'nAudSelectedPanel',
  stream: 'nStream', semester: 'nSemester', search: 'nPickSearch', list: 'nPickList',
  chips: 'nPickChips', count: 'nPickCount', clear: 'nPickClear', reach: 'nReach',
  dataKey: 'naud'
}, { initial: 'all', reachText: n => `${n} student${n === 1 ? '' : 's'} in this group. ` +
                                     `Only those with the app and notifications on will get it — ` +
                                     `check before sending.` });

async function loadStudents() {
  try {
    const res = await fetch(`${API}/parent/status-report`, { headers: await authHeaders() });
    const data = await res.json();
    if (data.success) students = data.students || [];
  } catch (err) {
    console.warn('Could not load students:', err);
  }

  cardAud.fillStreams();
  pushAud.fillStreams();
  cardAud.refreshReach();
  pushAud.refreshReach();
}


// The button either closes the card, sends the reader to a tab inside the app,
// or opens a link. One picker, so no two can be set at once.
const TAB_LABELS = { daily: 'Daily', full: 'Overall', insights: 'Insights', profile: 'Profile' };

function actionPayload() {
  const v = el('fAction').value;
  if (v.startsWith('tab:')) return { actionTab: v.slice(4), linkUrl: '' };
  if (v === 'link') return { actionTab: '', linkUrl: el('fLink').value.trim() };
  // 'ack' carries no destination — the label alone makes it a button that
  // simply closes the card.
  return { actionTab: '', linkUrl: '' };
}

function refreshActionRows() {
  const v = el('fAction').value;
  el('linkRow').style.display = v === 'link' ? 'block' : 'none';
  el('ctaRow').style.display = v ? 'block' : 'none';
  el('fCta').placeholder = v.startsWith('tab:') ? 'Go to ' + TAB_LABELS[v.slice(4)]
                         : v === 'ack' ? 'Got it'
                         : 'Learn more';
  refreshPreview();
}

// ---------- live preview ----------

function refreshPreview() {
  el('pvTitle').textContent = el('fTitle').value || 'Your title';
  el('pvBody').textContent = el('fBody').value || 'Your description appears here.';

  const action = el('fAction').value;
  const cta = el('pvCta');
  if (action) {
    cta.style.display = 'block';
    cta.textContent = el('fCta').value ||
      (action.startsWith('tab:') ? 'Go to ' + TAB_LABELS[action.slice(4)]
       : action === 'ack' ? 'Got it' : 'Learn more');
  } else {
    cta.style.display = 'none';
  }

  // An acknowledge button replaces Skip rather than sitting beside it.
  const pvSkip = el('pvSkip');
  if (pvSkip) pvSkip.style.display = action === 'ack' ? 'none' : 'block';

  const img = el('pvImage');
  if (uploadedImageUrl) {
    img.src = uploadedImageUrl;
    img.style.display = 'block';
  } else {
    img.style.display = 'none';
  }
}

// ---------- image upload ----------

async function uploadImage(file) {
  const res = await fetch(`${API}/config/cloudinary`, { headers: await authHeaders() });
  const cfg = await res.json();
  if (!cfg.success && !cfg.config) throw new Error('Upload service unavailable');

  const config = cfg.config || cfg;
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', config.uploadPreset);
  form.append('folder', 'announcements');

  const up = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    { method: 'POST', body: form });
  if (!up.ok) throw new Error('Cloudinary rejected the image');

  const data = await up.json();
  return data.secure_url;
}

async function onImageChosen(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('That is not an image'); return; }
  if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5 MB'); return; }

  el('imageLabel').textContent = 'Uploading…';
  try {
    uploadedImageUrl = await uploadImage(file);
    const preview = el('imagePreview');
    preview.src = uploadedImageUrl;
    preview.hidden = false;
    el('imageLabel').textContent = 'Click to replace';
    refreshPreview();
  } catch (err) {
    el('imageLabel').textContent = 'Click to upload a poster (optional)';
    toast('Upload failed: ' + err.message);
  }
}

// ---------- list ----------

async function loadList() {
  const host = el('annList');
  try {
    const res = await fetch(`${API}/announcements`, { headers: await authHeaders() });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const stamp = el('annStamp');
    if (stamp) {
      stamp.textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN',
        { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    }

    if (!data.announcements.length) {
      host.innerHTML = '<div style="font-size:12.5px; color:var(--text-muted);">Nothing published yet.</div>';
      return;
    }

    host.innerHTML = data.announcements.map(a => `
      <div class="ann ${a.isActive ? 'live' : ''}">
        ${a.imageUrl ? `<img src="${esc(a.imageUrl)}" alt="">` : ''}
        <div style="flex:1; min-width:0;">
          <div class="row" style="justify-content:space-between; margin-bottom:4px;">
            <span class="t">${esc(a.title)}</span>
            <span class="pill ${a.isActive ? 'live' : 'off'}">${a.isActive ? 'Live' : 'Off'}</span>
          </div>
          <div class="b">${esc(a.body || '')}</div>
          <div class="m" style="margin-bottom:4px;">
            <span style="color:var(--purple); font-weight:600;">${esc(a.audienceLabel || 'Everyone')}</span>
          </div>
          <div class="m" style="margin-bottom:10px;">
            ${a.dismissedBy} dismissed &middot; ${a.openedBy} opened the link &middot;
            by ${esc(a.createdBy)} on ${new Date(a.createdAt).toLocaleDateString('en-IN')}
            ${a.notifiedAt ? `<br><span style="color:var(--green); font-weight:600;">
              Notification sent to ${a.notifiedCount} device(s) on
              ${new Date(a.notifiedAt).toLocaleDateString('en-IN')}${a.notifySends > 1 ? ` &middot; sent ${a.notifySends} times` : ''}
            </span>` : ''}
          </div>
          <div class="row">
            <button class="btn btn-ghost btn-sm" data-toggle="${a._id}" data-active="${a.isActive}">
              ${a.isActive ? 'Turn off' : 'Make live'}
            </button>
            ${a.isActive ? `<button class="btn btn-ghost btn-sm" data-notify="${a._id}">
              ${a.notifiedAt ? 'Send again' : 'Send notification'}
            </button>` : ''}
            <button class="btn btn-ghost btn-sm" data-reset="${a._id}">Show again to all</button>
            <button class="btn btn-danger btn-sm" data-del="${a._id}">Delete</button>
          </div>
        </div>
      </div>`).join('');
  } catch (err) {
    host.innerHTML = `<div style="color:var(--red); font-size:12.5px;">${esc(err.message)}</div>`;
  }
}

// ---------- actions ----------

async function publish() {
  const title = el('fTitle').value.trim();
  if (!title) { toast('A title is required'); return; }

  const reach = cardAud.matching().length;
  if (cardAud.type === 'selected' && cardAud.picked.size === 0) {
    toast('Pick at least one student, or choose Everyone');
    return;
  }
  if (reach === 0) {
    toast('That audience has no students in it — nobody would see this');
    return;
  }

  // Sending to the whole college is worth a second look; the other audiences
  // are already spelled out on screen.
  if (cardAud.type === 'all' && !confirm(`Show this to all ${reach} parents?`)) return;

  const btn = el('publishBtn');
  btn.disabled = true;
  btn.textContent = 'Publishing…';

  try {
    const res = await fetch(`${API}/announcements`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        title,
        body: el('fBody').value.trim(),
        imageUrl: uploadedImageUrl,
        ...actionPayload(),
        ctaLabel: el('fCta').value.trim() ||
                  (el('fAction').value === 'ack' ? 'Got it' : ''),
        endsAt: el('fEnds').value || null,
        isActive: true,
        ...cardAud.cardPayload()
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    toast(`Published to ${cardAud.label()} — they will see it on next open`);
    clearForm();
    loadList();
  } catch (err) {
    toast('Could not publish: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publish';
  }
}

function clearForm() {
  ['fTitle', 'fBody', 'fLink', 'fCta', 'fEnds'].forEach(id => { el(id).value = ''; });
  el('fAction').value = 'ack';
  refreshActionRows();
  uploadedImageUrl = '';
  el('imagePreview').hidden = true;
  el('imageLabel').textContent = 'Click to upload a poster (optional)';
  cardAud.reset();
  refreshPreview();
}

async function act(id, method, path, confirmText) {
  if (confirmText && !confirm(confirmText)) return;
  try {
    const res = await fetch(`${API}/announcements/${id}${path || ''}`, {
      method, headers: await authHeaders()
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    loadList();
  } catch (err) {
    toast('Failed: ' + err.message);
  }
}

// ---------- tabs ----------

const PANE_TEXT = {
  cards: ['Announcements', 'A card shown to parents when they open the app. Each parent sees it once.'],
  notify: ['Send notification', 'A push notification straight to the parent\'s phone. It cannot be taken back.']
};

function showPane(name) {
  document.querySelectorAll('.tab').forEach(b => {
    const on = b.dataset.pane === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  el('paneCards').hidden = name !== 'cards';
  el('paneNotify').hidden = name !== 'notify';
  el('pageTitle').textContent = PANE_TEXT[name][0];
  el('pageLede').textContent = PANE_TEXT[name][1];
}

// ---------- the notification tab ----------

function refreshPushPreview() {
  const t = el('nTitle').value.trim();
  const b = el('nBody').value.trim();
  // Shown with the placeholders filled in, so the sender sees a real sentence
  // rather than {name} and only discovers the wording on a parent's phone.
  const sample = students[0];
  const fill = (s) => (el('nPersonalise').checked && sample)
    ? s.replace(/\{name\}/gi, sample.name || '')
       .replace(/\{firstName\}/gi, (sample.name || '').split(/\s+/)[0] || '')
    : s;

  el('nPvTitle').textContent = t ? fill(t) : 'Your title';
  el('nPvBody').textContent = b ? fill(b) : 'Your message appears here.';
  el('nCount').textContent = `${el('nBody').value.length} / 500`;
}

// Remembered so the confirmation can show the real number rather than the size
// of the group. Tied to the audience it was measured for, so changing the
// audience afterwards does not leave a stale figure on screen.
let lastReachCheck = null;

async function checkPushAudience() {
  const box = el('nPreviewBox');
  const btn = el('nPreviewBtn');
  btn.disabled = true;

  try {
    const res = await fetch(`${API}/broadcast/preview`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        title: el('nTitle').value,
        body: el('nBody').value,
        personalised: el('nPersonalise').checked,
        ...pushAud.pushPayload()
      })
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);

    lastReachCheck = {
      for: pushAud.label(),
      total: d.total, reachable: d.reachable, unreachable: d.unreachable
    };

    const classes = Object.entries(d.byClass || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, v]) => `<div style="display:flex; justify-content:space-between;">
                          <span>${esc(k)}</span><span>${v}</span></div>`).join('');

    box.innerHTML = `
      <div style="font-size:22px; font-weight:700; color:var(--text-primary);
                  line-height:1.1; margin-bottom:2px;">${d.reachable}</div>
      <div style="margin-bottom:12px;">
        of ${d.total} will actually get it${d.unreachable
          ? ` &middot; <span style="color:var(--amber);">${d.unreachable} unreachable</span>` : ''}
      </div>
      ${d.unreachable ? `<div style="font-size:11.5px; margin-bottom:12px;">
        Those ${d.unreachable} have no app installed or notifications switched off.
        A notification cannot reach them at all.
      </div>` : ''}
      ${classes ? `<div style="border-top:1px solid var(--border); padding-top:10px; margin-bottom:12px;">
        ${classes}</div>` : ''}
      ${(d.sample || []).length ? `
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:.06em;
                    color:var(--text-muted); margin-bottom:6px;">How it reads</div>
        ${d.sample.map(s => `
          <div style="background:var(--bg-elevated); border:1px solid var(--border);
                      border-radius:8px; padding:9px 11px; margin-bottom:6px;">
            <div style="font-weight:700; color:var(--text-primary); font-size:12.5px;">${esc(s.title)}</div>
            <div style="font-size:12px;">${esc(s.body)}</div>
            <div style="font-size:10.5px; color:var(--text-muted); margin-top:3px;">to ${esc(s.name)}</div>
          </div>`).join('')}` : ''}
    `;
  } catch (err) {
    box.innerHTML = `<span style="color:var(--red);">Could not check: ${esc(err.message)}</span>`;
  } finally {
    btn.disabled = false;
  }
}

// ---------- confirming a send ----------
//
// Replaces the browser's one-line box. This send reaches hundreds of phones at
// once and cannot be recalled, so it is worth showing the message as the parent
// will see it, next to who is getting it and when.

let cfmResolve = null;

function closeConfirm(answer) {
  const overlay = el('confirmOverlay');
  if (overlay.hidden) return;
  overlay.hidden = true;
  document.removeEventListener('keydown', cfmKeys);
  const resolve = cfmResolve;
  cfmResolve = null;
  if (resolve) resolve(answer);
}

function cfmKeys(e) {
  if (e.key === 'Escape') closeConfirm(false);
  if (e.key === 'Enter') closeConfirm(true);
}

function askConfirm({ heading, title, body, rows, warn, goLabel, scheduled }) {
  el('cfmHeading').textContent = heading;
  el('cfmTitle').textContent = title;
  el('cfmBody').textContent = body;
  el('cfmIcon').classList.toggle('scheduled', !!scheduled);
  el('cfmIcon').querySelector('.material-symbols-rounded').textContent =
    scheduled ? 'schedule' : 'notifications_active';

  el('cfmRows').innerHTML = rows
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('');

  el('cfmWarn').textContent = warn;
  el('cfmGo').textContent = goLabel;

  el('confirmOverlay').hidden = false;
  document.addEventListener('keydown', cfmKeys);
  // Focus Cancel, not Send: a stray Enter should not fire this off.
  setTimeout(() => el('cfmCancel').focus(), 30);

  return new Promise(resolve => { cfmResolve = resolve; });
}

// ---------- where a tap lands ----------

// A tab inside the app, or nothing. A notification never opens a browser, so
// there is no link to carry.
function pushActionPayload() {
  const v = el('nAction').value;
  return v.startsWith('tab:') ? { actionTab: v.slice(4) } : { actionTab: '' };
}

const PUSH_TAB_NAMES = { daily: 'Daily', full: 'Overall', insights: 'Insights', profile: 'Profile' };

function pushActionLabel() {
  const a = pushActionPayload();
  return a.actionTab ? `opens the app on ${PUSH_TAB_NAMES[a.actionTab]}` : 'opens the app';
}

// ---------- when to send ----------

let sendWhen = 'now';

function setWhen(kind) {
  sendWhen = kind;
  el('nWhenChoice').querySelectorAll('.aud-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.when === kind));
  el('nLaterPanel').style.display = kind === 'later' ? 'block' : 'none';
  el('nSendBtn').textContent = kind === 'later' ? 'Schedule' : 'Send';
  refreshWhenNote();
}

// The value of a datetime-local field is wall-clock text with no timezone. The
// server runs on UTC, so it is turned into a real instant here, where the
// browser knows what the sender actually meant.
function chosenInstant() {
  const v = el('nSendAt').value;
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function localFieldValue(date) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
         `T${p(date.getHours())}:${p(date.getMinutes())}`;
}

function refreshWhenNote() {
  const box = el('nWhenNote');
  if (!box) return;
  const d = chosenInstant();

  if (!d) {
    box.textContent = 'Pick a date and time.';
    box.style.color = 'var(--text-muted)';
    return;
  }

  const mins = Math.round((d.getTime() - Date.now()) / 60000);
  if (mins < 0) {
    box.textContent = 'That time has already passed.';
    box.style.color = 'var(--amber)';
    return;
  }

  const when = d.toLocaleString('en-IN',
    { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const away = mins < 60 ? `${mins} min` : mins < 1440
    ? `${Math.round(mins / 60)} hr` : `${Math.round(mins / 1440)} day(s)`;
  box.textContent = `Sends ${when} — ${away} from now.`;
  box.style.color = 'var(--text-muted)';
}

function applyPreset(kind) {
  const d = new Date();
  if (kind === 'morning') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  else { d.setHours(18, 0, 0, 0); if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1); }
  el('nSendAt').value = localFieldValue(d);
  refreshWhenNote();
}

async function sendPush() {
  const title = el('nTitle').value.trim();
  const body = el('nBody').value.trim();

  if (!title || !body) { toast('A title and a message are both needed'); return; }
  if (pushAud.type === 'selected' && pushAud.picked.size === 0) {
    toast('Pick at least one student, or choose Everyone');
    return;
  }

  const reach = pushAud.matching().length;
  if (reach === 0) { toast('That group has no students in it'); return; }

  const later = sendWhen === 'later';
  const when = later ? chosenInstant() : null;
  const act = pushActionPayload();

  if (later) {
    if (!when) { toast('Pick a date and time to send it'); return; }
    if (when.getTime() < Date.now()) { toast('That time has already passed'); return; }
  }

  // The audience count comes from the checker if it has been run, because it
  // knows how many can actually be reached; otherwise fall back to the size of
  // the group and say so.
  const rows = [
    ['To', `${esc(pushAud.label())}`],
    ['Reaches', lastReachCheck && lastReachCheck.for === pushAud.label()
      ? `<span class="count">${lastReachCheck.reachable}</span> of ${lastReachCheck.total} students` +
        (lastReachCheck.unreachable
          ? ` <span style="color:var(--amber)">· ${lastReachCheck.unreachable} unreachable</span>` : '')
      : `up to <span class="count">${reach}</span> students ` +
        `<span style="color:var(--text-muted)">(press Check who gets it for the exact number)</span>`],
    ['On tap', esc(pushActionLabel())],
    ['When', later
      ? esc(when.toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'short',
                                           hour: 'numeric', minute: '2-digit' }))
      : 'Immediately']
  ];
  if (el('nPersonalise').checked) rows.push(['Names', "Each parent sees their own child's name"]);

  const ok = await askConfirm({
    scheduled: later,
    heading: later ? 'Schedule this notification?' : 'Send this notification now?',
    title, body,
    rows,
    warn: later
      ? 'You can cancel it any time before it sends.'
      : 'It arrives on their phones straight away and cannot be taken back.',
    goLabel: later ? 'Schedule it' : 'Send now'
  });
  if (!ok) return;

  const btn = el('nSendBtn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = later ? 'Scheduling…' : 'Sending…';

  try {
    const res = await fetch(`${API}/broadcast/${later ? 'schedule' : 'send'}`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        title, body,
        personalised: el('nPersonalise').checked,
        ...act,
        ...pushAud.pushPayload(),
        ...(later ? { sendAt: when.toISOString() } : {})
      })
    });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);

    if (later) {
      toast('Scheduled');
      el('nPreviewBox').innerHTML =
        `<span style="color:var(--green); font-weight:600;">Queued for ` +
        `${esc(new Date(d.sendAt).toLocaleString('en-IN',
          { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}` +
        `</span>`;
      loadQueue();
    } else {
      toast(d.message || `Sent to ${d.sent} device(s)`);
      el('nPreviewBox').innerHTML =
        `<span style="color:var(--green); font-weight:600;">${esc(d.message || 'Sent')}</span>`;
    }
  } catch (err) {
    toast(later ? 'Could not schedule: ' + err.message : 'Could not send: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------- the queue ----------

const QUEUE_LABEL = {
  pending:   ['Waiting',   'var(--amber)'],
  sending:   ['Sending',   'var(--purple)'],
  sent:      ['Sent',      'var(--green)'],
  cancelled: ['Cancelled', 'var(--text-muted)'],
  failed:    ['Failed',    'var(--red)'],
  missed:    ['Missed',    'var(--red)']
};

async function loadQueue() {
  const host = el('nQueue');
  try {
    const res = await fetch(`${API}/broadcast/scheduled`, { headers: await authHeaders() });
    const d = await res.json();
    if (!d.success) throw new Error(d.error);

    if (!d.scheduled.length) {
      host.textContent = 'Nothing queued.';
      return;
    }

    host.innerHTML = d.scheduled.map(s => {
      const [word, colour] = QUEUE_LABEL[s.status] || [s.status, 'var(--text-muted)'];
      const when = new Date(s.sendAt).toLocaleString('en-IN',
        { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      return `
        <div style="border-bottom:1px solid var(--border); padding:9px 0;">
          <div class="row" style="justify-content:space-between; gap:8px;">
            <span style="font-weight:600; color:var(--text-primary);">${esc(s.title)}</span>
            <span style="color:${colour}; font-weight:700; font-size:10.5px;
                  text-transform:uppercase; letter-spacing:.05em;">${word}</span>
          </div>
          <div style="font-size:11.5px; margin-top:2px;">
            ${esc(when)} &middot; ${esc(s.audienceLabel || '')}
            ${s.status === 'sent' ? ` &middot; reached ${s.sent} device(s)` : ''}
            ${s.status === 'pending' ? ` &middot; about ${s.reachableWhenQueued} reachable` : ''}
          </div>
          ${s.note ? `<div style="font-size:11px; color:var(--amber); margin-top:2px;">${esc(s.note)}</div>` : ''}
          ${s.status === 'pending'
            ? `<button class="btn btn-ghost btn-sm" style="margin-top:6px;"
                 data-cancel="${s.id}">Cancel</button>` : ''}
        </div>`;
    }).join('');
  } catch (err) {
    host.innerHTML = `<span style="color:var(--red);">${esc(err.message)}</span>`;
  }
}

// Push an announcement to phones.
//
// The card alone only appears when a parent happens to open the app. This sends
// it as a notification too — so the count is checked with the server first and
// shown in the confirmation, because a send cannot be taken back.
async function sendNotification(btn) {
  const id = btn.dataset.notify;
  const label = btn.textContent.trim();

  btn.disabled = true;
  btn.textContent = 'Checking…';

  try {
    const res = await fetch(`${API}/announcements/${id}/notify-preview`, {
      headers: await authHeaders()
    });
    const p = await res.json();
    if (!p.success) throw new Error(p.error);

    if (p.reachable === 0) {
      toast('Nobody in that audience has notifications switched on');
      return;
    }

    const rows = [
      ['To', esc(p.audienceLabel || 'Everyone')],
      ['Reaches', `<span class="count">${p.reachable}</span> of ${p.total} students` +
        (p.unreachable
          ? ` <span style="color:var(--amber)">· ${p.unreachable} unreachable</span>` : '')],
      ['When', 'Immediately']
    ];
    if (p.unreachable > 0) {
      rows.push(['Note', `The ${p.unreachable} without notifications still see the card in the app.`]);
    }

    // A second send means those parents are told twice, so it is stated rather
    // than left for the sender to remember.
    const warn = p.alreadySentAt
      ? `Already sent on ${new Date(p.alreadySentAt).toLocaleDateString('en-IN')}. ` +
        `Sending again means those parents receive it a second time. This cannot be undone.`
      : 'It arrives on their phones straight away and cannot be taken back.';

    const ok = await askConfirm({
      heading: p.alreadySentAt ? 'Send this a second time?' : 'Send this as a notification?',
      title: p.title,
      body: p.body || '',
      rows, warn,
      goLabel: p.alreadySentAt ? 'Send again' : 'Send now'
    });
    if (!ok) return;

    btn.textContent = 'Sending…';
    const sendRes = await fetch(`${API}/announcements/${id}/notify`, {
      method: 'POST', headers: await authHeaders()
    });
    const out = await sendRes.json();
    if (!out.success) throw new Error(out.error);

    toast(out.message || 'Sent');
    loadList();
  } catch (err) {
    toast('Failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// ---------- wiring ----------

document.addEventListener('DOMContentLoaded', () => {
  el('imageDrop').addEventListener('click', () => el('imageInput').click());
  el('imageInput').addEventListener('change', e => onImageChosen(e.target.files[0]));

  ['fTitle', 'fBody', 'fLink', 'fCta'].forEach(id =>
    el(id).addEventListener('input', refreshPreview));
  el('fAction').addEventListener('change', refreshActionRows);

  el('publishBtn').addEventListener('click', publish);
  el('resetBtn').addEventListener('click', clearForm);

  cardAud.wire();
  pushAud.wire();

  // Tabs
  document.querySelectorAll('.tab').forEach(b =>
    b.addEventListener('click', () => showPane(b.dataset.pane)));

  // The notification tab
  ['nTitle', 'nBody'].forEach(id =>
    el(id).addEventListener('input', refreshPushPreview));
  el('nPersonalise').addEventListener('change', refreshPushPreview);
  el('nPreviewBtn').addEventListener('click', checkPushAudience);
  el('nSendBtn').addEventListener('click', sendPush);

  // The send confirmation
  el('cfmCancel').addEventListener('click', () => closeConfirm(false));
  el('cfmGo').addEventListener('click', () => closeConfirm(true));
  el('confirmOverlay').addEventListener('click', (e) => {
    // Clicking the dim area behind the card cancels, the same as Escape.
    if (e.target === el('confirmOverlay')) closeConfirm(false);
  });

  // When to send
  el('nWhenChoice').addEventListener('click', e => {
    const b = e.target.closest('[data-when]');
    if (b) setWhen(b.dataset.when);
  });
  el('nSendAt').addEventListener('input', refreshWhenNote);
  el('nLaterPanel').addEventListener('click', e => {
    const b = e.target.closest('[data-preset]');
    if (b) applyPreset(b.dataset.preset);
  });

  // The queue
  el('nQueueRefresh').addEventListener('click', loadQueue);
  el('nQueue').addEventListener('click', async e => {
    const b = e.target.closest('[data-cancel]');
    if (!b) return;
    if (!confirm('Cancel this scheduled notification? It will not be sent.')) return;
    try {
      const res = await fetch(`${API}/broadcast/scheduled/${b.dataset.cancel}`, {
        method: 'DELETE', headers: await authHeaders()
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error);
      toast('Cancelled');
      loadQueue();
    } catch (err) {
      toast(err.message);
      loadQueue();
    }
  });
  el('nClearBtn').addEventListener('click', () => {
    el('nTitle').value = '';
    el('nBody').value = '';
    el('nAction').value = '';
    pushAud.reset();
    el('nPreviewBox').innerHTML =
      'Press <strong style="color:var(--text-primary);">Check who gets it</strong> ' +
      'to see how many parents this reaches, and how it reads for the first few.';
    refreshPushPreview();
  });

  el('annList').addEventListener('click', async (e) => {
    const t = e.target;
    if (t.dataset.toggle) {
      const makeLive = t.dataset.active !== 'true';
      await fetch(`${API}/announcements/${t.dataset.toggle}`, {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ isActive: makeLive })
      });
      loadList();
    } else if (t.dataset.notify) {
      await sendNotification(t);
    } else if (t.dataset.reset) {
      act(t.dataset.reset, 'POST', '/reset-dismissals',
          'Show this again to every parent who already dismissed it?');
    } else if (t.dataset.del) {
      act(t.dataset.del, 'DELETE', '', 'Delete this announcement?');
    }
  });

  refreshActionRows();
  refreshPreview();
  refreshPushPreview();
  setWhen('now');
  showPane('cards');
  loadQueue();
});



// ---------- keep the list current ----------

let listTimer = null;
const LIST_REFRESH = 15000;

function startListRefresh() {
  stopListRefresh();
  listTimer = setInterval(() => {
    if (document.hidden) return;
    // Redrawing under a cursor that is about to press Delete is worse than a
    // slightly stale count, so hold off while the pointer is on the list.
    if (el('annList').matches(':hover')) return;
    loadList();
  }, LIST_REFRESH);
}

function stopListRefresh() {
  if (listTimer) clearInterval(listTimer);
  listTimer = null;
}

// Catch up immediately on returning to the tab rather than waiting out the
// interval, and stop polling while it is in the background.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopListRefresh();
  } else {
    loadList();
    startListRefresh();
  }
});

window.addEventListener('admin:ready', () => {
  loadList();
  loadStudents();
  startListRefresh();
});
