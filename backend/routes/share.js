// Shareable attendance links.
//
// A parent taps Share and gets a link they can send anywhere. Anyone holding
// it sees a read-only summary — overall and subject-wise — and nothing else:
// no phone number, no parent email, no day-by-day record of when the student
// was absent.
//
// The link carries a random token rather than the student ID, so it cannot be
// guessed or walked, and the parent can revoke it at any time.

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const parentAuth = require('../middleware/parentAuth');

// 22 URL-safe characters: short enough to share, far too large to brute force.
function newToken() {
  return crypto.randomBytes(16).toString('base64url').slice(0, 22);
}

// A link forwarded round a WhatsApp group is opened many times in a row, and
// each open otherwise re-reads every attendance row for that class. Attendance
// changes at most a few times a day, so a short cache costs nothing.
const summaryCache = new Map();
const SUMMARY_TTL = 2 * 60 * 1000;

function cached(token) {
  const hit = summaryCache.get(token);
  if (!hit) return null;
  if (Date.now() - hit.at > SUMMARY_TTL) {
    summaryCache.delete(token);
    return null;
  }
  return hit.data;
}

function remember(token, data) {
  // Bounded, so a flood of invalid tokens cannot grow this without limit.
  if (summaryCache.size > 500) summaryCache.clear();
  summaryCache.set(token, { at: Date.now(), data });
}

// Same language filtering the parent's own attendance uses, so a shared figure
// matches what the parent sees in the app.
function isRecordRelevant(record, student) {
  const LANGUAGES = ['HINDI', 'KANNADA', 'SANSKRIT'];
  const subjectUpper = (record.subject || '').toUpperCase().trim();

  if (LANGUAGES.includes(subjectUpper)) {
    const studentLang = (student.languageSubject || '').toUpperCase().trim();
    if (!studentLang) return true;
    return subjectUpper === studentLang;
  }
  if (record.languageSubject) {
    const recLang = String(record.languageSubject).toUpperCase().trim();
    const studentLang = (student.languageSubject || '').toUpperCase().trim();
    if (studentLang && recLang && recLang !== studentLang) return false;
  }
  if (record.electiveSubject) {
    const recElec = String(record.electiveSubject).toUpperCase().trim();
    const studentElec = (student.electiveSubject || '').toUpperCase().trim();
    if (studentElec && recElec && recElec !== studentElec) return false;
  }
  return true;
}

function isPresent(list, student) {
  if (!Array.isArray(list)) return false;
  const sid = (student.studentID || '').trim().toLowerCase();
  const name = (student.name || '').trim().toLowerCase();
  return list.some(e => {
    const v = String(e || '').trim().toLowerCase();
    return v === sid || v === name;
  });
}

async function buildSummary(db, student) {
  const records = await db.collection('attendance').find({
    stream: { $regex: new RegExp(`^${String(student.stream).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    semester: student.semester,
    isDeleted: { $ne: true }
  }).toArray();

  const relevant = records.filter(r => isRecordRelevant(r, student));

  const bySubject = {};
  let present = 0;
  let total = 0;

  relevant.forEach(r => {
    const subject = r.subject || 'UNKNOWN';
    const here = isPresent(r.studentsPresent, student);
    if (!bySubject[subject]) bySubject[subject] = { total: 0, present: 0 };
    bySubject[subject].total++;
    if (here) { bySubject[subject].present++; present++; }
    total++;
  });

  return {
    overall: {
      totalClasses: total,
      present,
      absent: total - present,
      percentage: total ? Math.round((present / total) * 100) : 0
    },
    subjectWise: Object.entries(bySubject).map(([subject, d]) => ({
      subject,
      totalClasses: d.total,
      present: d.present,
      absent: d.total - d.present,
      percentage: d.total ? Math.round((d.present / d.total) * 100) : 0
    })).sort((a, b) => a.subject.localeCompare(b.subject))
  };
}

// ---------------------------------------------------------------------------
// PARENT SIDE — create and revoke
// ---------------------------------------------------------------------------

// POST /link - the link for this parent's child, created on first use and
// reused after, so sharing twice does not leave two live links behind.
router.post('/link', parentAuth, async (req, res) => {
  try {
    const col = req.db.collection('students');
    const student = await col.findOne({
      studentID: { $regex: new RegExp(`^${req.parentSession.studentID}$`, 'i') }
    });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    let token = student.shareToken;
    if (!token) {
      token = newToken();
      await col.updateOne({ _id: student._id },
        { $set: { shareToken: token, shareCreatedAt: new Date() } });
    }

    res.json({ success: true, token, name: student.name });
  } catch (error) {
    console.error('❌ Share link error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /status - whether a link is currently live, so the app can offer to turn
// it off on a later visit rather than only in the session that created it.
router.get('/status', parentAuth, async (req, res) => {
  try {
    const student = await req.db.collection('students').findOne(
      { studentID: { $regex: new RegExp(`^${req.parentSession.studentID}$`, 'i') } },
      { projection: { shareToken: 1 } }
    );
    // The token comes back so the app can show the existing link again rather
    // than making the parent mint a second one to see it.
    res.json({
      success: true,
      active: !!(student && student.shareToken),
      token: (student && student.shareToken) || null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /revoke - every link already sent stops working immediately.
router.post('/revoke', parentAuth, async (req, res) => {
  try {
    const col = req.db.collection('students');
    const student = await col.findOne(
      { studentID: { $regex: new RegExp(`^${req.parentSession.studentID}$`, 'i') } },
      { projection: { shareToken: 1 } }
    );

    await col.updateOne({ _id: student._id }, { $unset: { shareToken: '', shareCreatedAt: '' } });

    // Turning a link off has to take effect at once, not when the cache expires.
    if (student && student.shareToken) summaryCache.delete(student.shareToken);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// PUBLIC — whoever was given the link
// ---------------------------------------------------------------------------

router.get('/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    // Reject anything that is not shaped like a token before touching the
    // database, so junk requests cost nothing.
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) {
      return res.status(404).json({ success: false, error: 'This link is not valid.' });
    }

    const hit = cached(token);
    if (hit) return res.json(hit);

    const student = await req.db.collection('students').findOne(
      { shareToken: token },
      // Only what the page renders. Nothing here can leak a phone number or an
      // address just because a field was added to the schema later.
      { projection: { studentID: 1, name: 1, stream: 1, semester: 1,
                      languageSubject: 1, electiveSubject: 1 } }
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'This link has been turned off or does not exist.'
      });
    }

    const summary = await buildSummary(req.db, student);

    const payload = {
      success: true,
      student: {
        name: student.name,
        stream: student.stream,
        semester: student.semester
      },
      ...summary,
      generatedAt: new Date()
    };

    remember(token, payload);
    res.json(payload);
  } catch (error) {
    console.error('❌ Shared attendance error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
