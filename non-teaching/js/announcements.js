// Announcements shown to parents when they open the app.

const API = window.APP_CONFIG.API_BASE_URL;

let uploadedImageUrl = '';
let audienceType = 'all';
let students = [];          // loaded once, for the class list and the picker
let picked = new Set();

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

async function loadStudents() {
  try {
    const res = await fetch(`${API}/parent/status-report`, { headers: await authHeaders() });
    const data = await res.json();
    if (data.success) students = data.students || [];
  } catch (err) {
    console.warn('Could not load students:', err);
  }

  const streams = [...new Set(students.map(s => s.stream).filter(Boolean))].sort();
  el('aStream').innerHTML = '<option value="ALL">All streams</option>' +
    streams.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  refreshReach();
}

// Everything the server needs to decide who this is for.
function audiencePayload() {
  if (audienceType === 'selected') {
    return { audienceType: 'selected', studentIDs: Array.from(picked) };
  }
  if (audienceType === 'class') {
    return { audienceType: 'class', stream: el('aStream').value, semester: el('aSemester').value };
  }
  return { audienceType: 'all' };
}

// How many students the current choice covers, so the reach is visible before
// publishing rather than after.
function matchingStudents() {
  if (audienceType === 'selected') return students.filter(s => picked.has(s.studentID));
  if (audienceType === 'all') return students;

  const stream = el('aStream').value;
  const sem = el('aSemester').value;
  return students.filter(s =>
    (stream === 'ALL' || String(s.stream || '').toLowerCase() === stream.toLowerCase()) &&
    (sem === 'ALL' || Number(s.semester) === Number(sem)));
}

function refreshReach() {
  const box = el('audReach');

  if (!students.length) {
    box.textContent = 'Loading the student list…';
    box.style.color = 'var(--text-muted)';
    return;
  }

  const n = matchingStudents().length;
  if (n === 0) {
    // Publishing to nobody is always a mistake, so say so rather than let it
    // through and leave the sender wondering why no parent saw it.
    box.textContent = audienceType === 'selected'
      ? 'Nobody picked yet — search and tick the students below.'
      : 'No student matches that class, so nobody would see this.';
    box.style.color = 'var(--amber)';
    return;
  }

  box.textContent = `${n} student${n === 1 ? '' : 's'} will see this card.`;
  box.style.color = 'var(--text-muted)';
}

function setAudience(kind) {
  audienceType = kind;
  document.querySelectorAll('.aud-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.aud === kind));
  el('audClassPanel').style.display = kind === 'class' ? 'block' : 'none';
  el('audSelectedPanel').style.display = kind === 'selected' ? 'block' : 'none';
  if (kind === 'selected') renderPickList();
  refreshReach();
}

function renderPickList() {
  const q = (el('aPickSearch').value || '').trim().toLowerCase();
  const list = el('aPickList');

  // Chosen students stay on top so refining a search never hides them.
  const chosen = students.filter(s => picked.has(s.studentID));
  const matches = q
    ? students.filter(s => !picked.has(s.studentID) &&
        ((s.name || '').toLowerCase().includes(q) || (s.studentID || '').toLowerCase().includes(q)))
    : [];

  const rows = [...chosen, ...matches.slice(0, 40)];
  list.innerHTML = rows.length
    ? rows.map(s => `
        <div class="pick-row ${picked.has(s.studentID) ? 'picked' : ''}" data-id="${esc(s.studentID)}">
          <input type="checkbox" ${picked.has(s.studentID) ? 'checked' : ''} tabindex="-1"
                 style="width:auto; margin:0;">
          <span class="pick-name">${esc(s.name || s.studentID)}</span>
          <span class="pick-meta">${esc(s.stream || '')} ${s.semester ? 'Sem ' + s.semester : ''}</span>
        </div>`).join('')
    : `<div style="padding:14px; font-size:12px; color:var(--text-muted);">
         ${q ? 'No student matches that.' : 'Type a name or student ID to find people.'}
       </div>`;

  el('aPickCount').textContent = `${picked.size} selected`;

  el('aPickChips').innerHTML = chosen.slice(0, 10).map(s => `
      <span class="pick-chip">${esc((s.name || s.studentID).split(' ')[0])}
        <button type="button" data-remove="${esc(s.studentID)}">&times;</button>
      </span>`).join('') +
    (chosen.length > 10 ? `<span class="pick-chip">+${chosen.length - 10} more</span>` : '');

  refreshReach();
}

// ---------- live preview ----------

function refreshPreview() {
  el('pvTitle').textContent = el('fTitle').value || 'Your title';
  el('pvBody').textContent = el('fBody').value || 'Your description appears here.';

  const cta = el('pvCta');
  if (el('fLink').value.trim()) {
    cta.style.display = 'block';
    cta.textContent = el('fCta').value || 'Learn more';
  } else {
    cta.style.display = 'none';
  }

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
          </div>
          <div class="row">
            <button class="btn btn-ghost btn-sm" data-toggle="${a._id}" data-active="${a.isActive}">
              ${a.isActive ? 'Turn off' : 'Make live'}
            </button>
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

  const reach = matchingStudents().length;
  if (audienceType === 'selected' && picked.size === 0) {
    toast('Pick at least one student, or choose Everyone');
    return;
  }
  if (reach === 0) {
    toast('That audience has no students in it — nobody would see this');
    return;
  }

  // Sending to the whole college is worth a second look; the other audiences
  // are already spelled out on screen.
  if (audienceType === 'all' && !confirm(`Show this to all ${reach} parents?`)) return;

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
        linkUrl: el('fLink').value.trim(),
        ctaLabel: el('fCta').value.trim(),
        endsAt: el('fEnds').value || null,
        isActive: true,
        ...audiencePayload()
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    const who = audienceType === 'all' ? 'everyone'
      : audienceType === 'selected' ? `${picked.size} selected student(s)`
      : `${el('aStream').value}${el('aSemester').value === 'ALL' ? '' : ' sem ' + el('aSemester').value}`;
    toast(`Published to ${who} — they will see it on next open`);
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
  ['fTitle', 'fBody', 'fLink', 'fCta', 'fEnds', 'aPickSearch'].forEach(id => { el(id).value = ''; });
  uploadedImageUrl = '';
  picked.clear();
  el('imagePreview').hidden = true;
  el('imageLabel').textContent = 'Click to upload a poster (optional)';
  setAudience('all');
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

// ---------- wiring ----------

document.addEventListener('DOMContentLoaded', () => {
  el('imageDrop').addEventListener('click', () => el('imageInput').click());
  el('imageInput').addEventListener('change', e => onImageChosen(e.target.files[0]));

  ['fTitle', 'fBody', 'fLink', 'fCta'].forEach(id =>
    el(id).addEventListener('input', refreshPreview));

  el('publishBtn').addEventListener('click', publish);
  el('resetBtn').addEventListener('click', clearForm);

  document.querySelectorAll('.aud-btn').forEach(b =>
    b.addEventListener('click', () => setAudience(b.dataset.aud)));
  el('aStream').addEventListener('change', refreshReach);
  el('aSemester').addEventListener('change', refreshReach);
  el('aPickSearch').addEventListener('input', renderPickList);

  el('aPickList').addEventListener('click', (e) => {
    const row = e.target.closest('.pick-row');
    if (!row) return;
    const id = row.dataset.id;
    if (picked.has(id)) picked.delete(id); else picked.add(id);
    renderPickList();
  });

  el('aPickChips').addEventListener('click', (e) => {
    const id = e.target.dataset?.remove;
    if (id) { picked.delete(id); renderPickList(); }
  });

  el('aPickClear').addEventListener('click', () => { picked.clear(); renderPickList(); });

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
    } else if (t.dataset.reset) {
      act(t.dataset.reset, 'POST', '/reset-dismissals',
          'Show this again to every parent who already dismissed it?');
    } else if (t.dataset.del) {
      act(t.dataset.del, 'DELETE', '', 'Delete this announcement?');
    }
  });

  refreshPreview();
});

window.addEventListener('admin:ready', () => {
  loadList();
  loadStudents();
});
