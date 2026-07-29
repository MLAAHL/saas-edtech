// Mentorship attendance.
//
// Deliberately kept in its own collection rather than reusing `attendance`:
//   - the attendance schema requires stream/semester/subject, and a mentor's
//     group can span many classes (or none of them cleanly),
//   - mentorship sessions must NOT count towards the 75% subject eligibility
//     rule, so they must never be mixed into subject attendance queries.
//
// Parents are not notified of a mentorship absence. That is intentional: an
// "absent" push for a mentoring session reads to a parent like a missed class.

const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middleware/firebaseAuth');

router.use(firebaseAuth);

const COLLECTION = 'mentorshipAttendance';

// Resolve the signed-in teacher, tolerating case differences in stored emails.
async function findMentor(db, email) {
  if (!email) return null;
  const e = email.toLowerCase().trim();
  return db.collection('teachers').findOne({
    email: { $regex: new RegExp('^' + e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }
  });
}

// GET /roster - the signed-in mentor's mentees, grouped by class.
// The roster comes from the mentee list, not from stream/semester, so a mentor
// with one whole class and a mentor with students from ten classes both work.
router.get('/roster', async (req, res) => {
  try {
    const email = req.user?.email;
    const mentor = await findMentor(req.db, email);

    if (!mentor) {
      return res.json({
        success: true, isMentor: false, mentorEmail: email,
        groups: [], totalStudents: 0,
        message: 'You do not have any mentees assigned yet.'
      });
    }

    const menteeIds = [...new Set((mentor.mentees || []).map(m => m.studentID).filter(Boolean))];

    if (menteeIds.length === 0) {
      return res.json({
        success: true, isMentor: true, mentorEmail: mentor.email,
        groups: [], totalStudents: 0,
        message: 'You do not have any mentees assigned yet.'
      });
    }

    // Pull live details so names/classes reflect the students collection rather
    // than whatever was copied into the mentee list when it was created.
    const students = await req.db.collection('students')
      .find({ studentID: { $in: menteeIds } },
            { projection: { studentID: 1, name: 1, stream: 1, semester: 1, isActive: 1 } })
      .toArray();

    const found = new Map();
    students.forEach(s => { if (!found.has(s.studentID)) found.set(s.studentID, s); });

    // Mentees whose student record no longer exists — surfaced rather than hidden
    // so the office can see the list needs tidying.
    const missing = menteeIds.filter(id => !found.has(id));

    const groups = {};
    menteeIds.forEach(id => {
      const s = found.get(id);
      if (!s) return;
      const key = (s.stream || 'Unknown') + '||' + (s.semester ?? '?');
      if (!groups[key]) {
        groups[key] = { stream: s.stream || 'Unknown', semester: s.semester ?? null, students: [] };
      }
      groups[key].students.push({
        studentID: s.studentID,
        name: s.name || s.studentID,
        stream: s.stream,
        semester: s.semester
      });
    });

    const groupList = Object.values(groups)
      .map(g => ({ ...g, students: g.students.sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => a.stream.localeCompare(b.stream) || (a.semester || 0) - (b.semester || 0));

    res.json({
      success: true,
      isMentor: true,
      mentorEmail: mentor.email,
      mentorName: mentor.name || mentor.email.split('@')[0],
      groups: groupList,
      totalStudents: groupList.reduce((n, g) => n + g.students.length, 0),
      missingMentees: missing
    });
  } catch (error) {
    console.error('❌ Mentorship roster error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - record one mentorship session.
router.post('/', async (req, res) => {
  try {
    const email = req.user?.email;
    const mentor = await findMentor(req.db, email);
    if (!mentor) {
      return res.status(403).json({ success: false, error: 'You are not registered as a mentor.' });
    }

    const { date, studentsPresent, note } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: 'A valid date (YYYY-MM-DD) is required.' });
    }
    if (!Array.isArray(studentsPresent)) {
      return res.status(400).json({ success: false, error: 'studentsPresent must be an array.' });
    }

    const roster = [...new Set((mentor.mentees || []).map(m => m.studentID).filter(Boolean))];
    if (roster.length === 0) {
      return res.status(400).json({ success: false, error: 'You have no mentees to mark.' });
    }

    // Only accept IDs that are actually on this mentor's roster.
    const present = [...new Set(studentsPresent.map(s => String(s).trim()))].filter(id => roster.includes(id));
    // Absent is stored explicitly: mentee lists change over time, so it cannot be
    // recomputed later from the roster as it stands then.
    const absent = roster.filter(id => !present.includes(id));

    const mentorEmail = mentor.email.toLowerCase();

    const doc = {
      mentorEmail,
      mentorName: mentor.name || mentorEmail.split('@')[0],
      date,
      studentsPresent: present,
      studentsAbsent: absent,
      totalStudents: roster.length,
      presentCount: present.length,
      absentCount: absent.length,
      note: (note || '').toString().trim().slice(0, 500),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // One session per mentor per day: re-submitting corrects the earlier entry
    // instead of silently stacking duplicates.
    const existing = await req.db.collection(COLLECTION).findOne({ mentorEmail, date });

    if (existing) {
      await req.db.collection(COLLECTION).updateOne(
        { _id: existing._id },
        { $set: { ...doc, createdAt: existing.createdAt } }
      );
      return res.json({
        success: true, updated: true, id: existing._id,
        presentCount: doc.presentCount, absentCount: doc.absentCount,
        totalStudents: doc.totalStudents,
        message: `Updated ${date}: ${doc.presentCount} present, ${doc.absentCount} absent.`
      });
    }

    const result = await req.db.collection(COLLECTION).insertOne(doc);
    res.json({
      success: true, updated: false, id: result.insertedId,
      presentCount: doc.presentCount, absentCount: doc.absentCount,
      totalStudents: doc.totalStudents,
      message: `Saved ${date}: ${doc.presentCount} present, ${doc.absentCount} absent.`
    });
  } catch (error) {
    console.error('❌ Mentorship attendance save error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /session/:date - what was recorded for a given day, so the page can
// reopen an existing session for editing.
router.get('/session/:date', async (req, res) => {
  try {
    const mentor = await findMentor(req.db, req.user?.email);
    if (!mentor) return res.json({ success: true, session: null });

    const session = await req.db.collection(COLLECTION)
      .findOne({ mentorEmail: mentor.email.toLowerCase(), date: req.params.date });

    res.json({ success: true, session: session || null });
  } catch (error) {
    console.error('❌ Mentorship session fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /history - recent sessions for the signed-in mentor.
router.get('/history', async (req, res) => {
  try {
    const mentor = await findMentor(req.db, req.user?.email);
    if (!mentor) return res.json({ success: true, sessions: [] });

    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 200);
    const sessions = await req.db.collection(COLLECTION)
      .find({ mentorEmail: mentor.email.toLowerCase() },
            { projection: { studentsPresent: 0, studentsAbsent: 0 } })
      .sort({ date: -1 })
      .limit(limit)
      .toArray();

    res.json({ success: true, sessions });
  } catch (error) {
    console.error('❌ Mentorship history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /summary - per-student attendance across all recorded sessions.
router.get('/summary', async (req, res) => {
  try {
    const mentor = await findMentor(req.db, req.user?.email);
    if (!mentor) return res.json({ success: true, students: [], sessionCount: 0 });

    const mentorEmail = mentor.email.toLowerCase();
    const sessions = await req.db.collection(COLLECTION).find({ mentorEmail }).toArray();

    const tally = {};
    sessions.forEach(s => {
      (s.studentsPresent || []).forEach(id => {
        tally[id] = tally[id] || { present: 0, absent: 0 };
        tally[id].present++;
      });
      (s.studentsAbsent || []).forEach(id => {
        tally[id] = tally[id] || { present: 0, absent: 0 };
        tally[id].absent++;
      });
    });

    const ids = Object.keys(tally);
    const students = await req.db.collection('students')
      .find({ studentID: { $in: ids } },
            { projection: { studentID: 1, name: 1, stream: 1, semester: 1 } })
      .toArray();
    const nameOf = {};
    students.forEach(s => { if (!nameOf[s.studentID]) nameOf[s.studentID] = s; });

    const rows = ids.map(id => {
      const t = tally[id];
      const held = t.present + t.absent;
      return {
        studentID: id,
        name: nameOf[id]?.name || id,
        stream: nameOf[id]?.stream || null,
        semester: nameOf[id]?.semester ?? null,
        present: t.present,
        absent: t.absent,
        sessionsHeld: held,
        percentage: held ? Math.round((t.present / held) * 100) : 0
      };
    }).sort((a, b) => a.percentage - b.percentage || a.name.localeCompare(b.name));

    res.json({ success: true, sessionCount: sessions.length, students: rows });
  } catch (error) {
    console.error('❌ Mentorship summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
