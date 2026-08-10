// Announcements shown to parents when they open the app.
//
// A card over the dashboard: image, a few words, and an optional link. The
// parent dismisses it and does not see that one again — dismissal is recorded
// per announcement, so publishing a new one still reaches everybody.

const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middleware/firebaseAuth');
const parentAuth = require('../middleware/parentAuth');

const COLLECTION = 'announcements';

const MAX_TITLE = 80;
const MAX_BODY = 400;
const MAX_CTA = 30;

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

// Only http(s), so a stored link can never become a javascript: payload in the
// parent app.
function safeUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url.slice(0, 500) : '';
}

// A button can send the reader to a tab inside the app instead of out to a
// link. Whitelisted, because the value is handed straight to the app's own
// navigation — 'full' is the tab labelled Overall.
const TABS = ['daily', 'full', 'insights', 'profile'];
const safeTab = (value) => TABS.includes(String(value || '').trim()) ? String(value).trim() : '';

// Who an announcement is for. Stored on the document so the same card can be
// a college-wide notice or a message to one class.
function readAudience(body) {
  const type = ['all', 'class', 'selected'].includes(body.audienceType)
    ? body.audienceType : 'all';

  if (type === 'selected') {
    const ids = Array.isArray(body.studentIDs) ? body.studentIDs : [];
    return {
      type: 'selected',
      studentIDs: [...new Set(ids.map(s => String(s).trim()).filter(Boolean))].slice(0, 2000)
    };
  }
  if (type === 'class') {
    return {
      type: 'class',
      stream: clean(body.stream, 60) || 'ALL',
      semester: body.semester && body.semester !== 'ALL' ? parseInt(body.semester, 10) : null
    };
  }
  return { type: 'all' };
}

function audienceLabel(a) {
  if (!a || a.type === 'all') return 'Everyone';
  if (a.type === 'selected') return `${(a.studentIDs || []).length} selected student(s)`;
  const stream = a.stream && a.stream !== 'ALL' ? a.stream : 'All streams';
  return a.semester ? `${stream} · Sem ${a.semester}` : stream;
}

// Does this announcement apply to this student?
function matchesAudience(doc, student) {
  const a = doc.audience;
  if (!a || a.type === 'all') return true;
  if (!student) return false;

  if (a.type === 'selected') {
    return (a.studentIDs || []).includes(student.studentID);
  }

  const streamOk = !a.stream || a.stream === 'ALL' ||
    String(a.stream).toLowerCase() === String(student.stream || '').toLowerCase();
  const semOk = a.semester == null || Number(a.semester) === Number(student.semester);
  return streamOk && semOk;
}

function shape(doc) {
  return {
    _id: String(doc._id),
    title: doc.title,
    body: doc.body,
    imageUrl: doc.imageUrl || '',
    linkUrl: doc.linkUrl || '',
    actionTab: doc.actionTab || '',
    ctaLabel: doc.ctaLabel || '',
    isActive: !!doc.isActive,
    startsAt: doc.startsAt || null,
    endsAt: doc.endsAt || null,
    audience: doc.audience || { type: 'all' },
    audienceLabel: audienceLabel(doc.audience),
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
    dismissedBy: (doc.dismissedBy || []).length,
    openedBy: (doc.openedBy || []).length
  };
}

// ---------------------------------------------------------------------------
// PARENT SIDE
// ---------------------------------------------------------------------------

// GET /active - the one announcement a parent should see right now, or null.
// On the parent session, not the staff one. The app only asks for this after
// the dashboard has loaded, so a token is always in hand by then; requiring it
// means a class notice cannot be fished out by guessing student ids.
router.get('/active', parentAuth, async (req, res) => {
  try {
    const now = new Date();
    const live = await req.db.collection(COLLECTION).find({
      isActive: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $exists: false } }, { endsAt: { $gte: now } }] }
      ]
    }).sort({ createdAt: -1 }).toArray();

    if (live.length === 0) return res.json({ success: true, announcement: null });

    // Who is asking comes from the signed-in session, never from the query
    // string, so a targeted notice is matched against the real student rather
    // than whichever id the caller typed.
    const studentID = String(req.parentSession.studentID || '').trim();
    const student = studentID
      ? await req.db.collection('students').findOne(
          { studentID: { $regex: new RegExp(`^${studentID.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { projection: { studentID: 1, stream: 1, semester: 1 } })
      : null;

    const doc = live.find(d => matchesAudience(d, student));
    if (!doc) return res.json({ success: true, announcement: null });

    res.json({
      success: true,
      announcement: {
        id: String(doc._id),
        title: doc.title,
        body: doc.body,
        imageUrl: doc.imageUrl || '',
        linkUrl: doc.linkUrl || '',
        actionTab: doc.actionTab || '',
        ctaLabel: doc.ctaLabel || ''
      }
    });
  } catch (error) {
    console.error('❌ Announcement fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/seen - a parent dismissed or opened it. Recorded so the college can
// tell whether a notice landed; the app itself remembers locally.
router.post('/:id/seen', parentAuth, async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    const { action } = req.body;
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Bad announcement id' });
    }

    // From the session, so the tally of who saw a notice reflects real readers
    // and cannot be stuffed with invented ids. Still shape-checked before it
    // joins an array that only ever grows, and checked as given rather than
    // truncated first — trimming would let an oversized value through as its
    // prefix.
    const id = String(req.parentSession.studentID || '').trim();
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(id)) {
      return res.json({ success: true });
    }

    const field = action === 'opened' ? 'openedBy' : 'dismissedBy';
    await req.db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(req.params.id) },
      { $addToSet: { [field]: id } }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Announcement seen error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// ADMIN SIDE
// ---------------------------------------------------------------------------

router.use(firebaseAuth);

router.get('/', async (req, res) => {
  try {
    const docs = await req.db.collection(COLLECTION)
      .find({}).sort({ createdAt: -1 }).limit(50).toArray();
    res.json({ success: true, announcements: docs.map(shape) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const title = clean(req.body.title, MAX_TITLE);
    const body = clean(req.body.body, MAX_BODY);
    if (!title) {
      return res.status(400).json({ success: false, error: 'A title is required.' });
    }

    const doc = {
      title,
      body,
      imageUrl: safeUrl(req.body.imageUrl),
      linkUrl: safeUrl(req.body.linkUrl),
      actionTab: safeTab(req.body.actionTab),
      ctaLabel: clean(req.body.ctaLabel, MAX_CTA),
      audience: readAudience(req.body),
      isActive: req.body.isActive !== false,
      startsAt: req.body.startsAt ? new Date(req.body.startsAt) : null,
      endsAt: req.body.endsAt ? new Date(req.body.endsAt) : null,
      dismissedBy: [],
      openedBy: [],
      createdBy: req.user?.email || 'unknown',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Several can be live at once now that each has an audience — a college
    // notice alongside a message to one class. A parent is shown the newest
    // one that applies to them, never two at a time.
    const result = await req.db.collection(COLLECTION).insertOne(doc);
    res.json({ success: true, id: String(result.insertedId) });
  } catch (error) {
    console.error('❌ Announcement create error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Bad announcement id' });
    }
    const _id = new ObjectId(req.params.id);
    const set = { updatedAt: new Date() };

    if (req.body.title !== undefined) set.title = clean(req.body.title, MAX_TITLE);
    if (req.body.body !== undefined) set.body = clean(req.body.body, MAX_BODY);
    if (req.body.imageUrl !== undefined) set.imageUrl = safeUrl(req.body.imageUrl);
    if (req.body.linkUrl !== undefined) set.linkUrl = safeUrl(req.body.linkUrl);
    if (req.body.actionTab !== undefined) set.actionTab = safeTab(req.body.actionTab);
    if (req.body.ctaLabel !== undefined) set.ctaLabel = clean(req.body.ctaLabel, MAX_CTA);
    if (req.body.isActive !== undefined) set.isActive = !!req.body.isActive;
    if (req.body.audienceType !== undefined) set.audience = readAudience(req.body);

    await req.db.collection(COLLECTION).updateOne({ _id }, { $set: set });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Showing it again to everyone who already dismissed it — for a notice that
// was corrected and needs a second run.
router.post('/:id/reset-dismissals', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Bad announcement id' });
    }
    await req.db.collection(COLLECTION).updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { dismissedBy: [], updatedAt: new Date() } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Bad announcement id' });
    }
    await req.db.collection(COLLECTION).deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
