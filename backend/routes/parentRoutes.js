// parentRoutes.js - Parent Portal API Routes (Read-Only)
const express = require('express');
const router = express.Router();

router.use((req, res, next) => {
  const db = req.app.locals.db || req.app.get('db');
  if (!db) return res.status(503).json({ success: false, error: 'Database unavailable' });
  req.db = db;
  next();
});

function isStudentPresent(studentsPresent, student) {
  if (!studentsPresent || !Array.isArray(studentsPresent)) return false;
  const sid = (student.studentID || '').trim();
  const sname = (student.name || '').trim();
  return studentsPresent.some(e => {
    const entry = (e || '').trim();
    return entry === sid || entry.toLowerCase() === sid.toLowerCase() ||
           entry === sname || entry.toLowerCase() === sname.toLowerCase();
  });
}

function buildDateQuery(dateStr) {
  const d = new Date(dateStr);
  const startUTC = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0));
  const endUTC = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));
  return { $or: [{ date: dateStr }, { date: { $gte: startUTC, $lte: endUTC } }] };
}

// Filter: only show records relevant to this student's language/elective
function isRecordRelevant(record, student) {
  const LANGUAGES = ['HINDI', 'KANNADA', 'SANSKRIT'];
  const subjectUpper = (record.subject || '').toUpperCase().trim();

  // If this record is a language subject
  if (LANGUAGES.includes(subjectUpper)) {
    const studentLang = (student.languageSubject || '').toUpperCase().trim();
    if (!studentLang) return true; // no lang preference, show all
    return subjectUpper === studentLang;
  }

  // If record has a languageSubject tag and student has one, filter
  if (record.languageSubject) {
    const recLang = (record.languageSubject || '').toUpperCase().trim();
    const studentLang = (student.languageSubject || '').toUpperCase().trim();
    if (studentLang && recLang && recLang !== studentLang) return false;
  }

  // If record has electiveSubject tag and student has one, filter
  if (record.electiveSubject) {
    const recElec = (record.electiveSubject || '').toUpperCase().trim();
    const studentElec = (student.electiveSubject || '').toUpperCase().trim();
    if (studentElec && recElec && recElec !== studentElec) return false;
  }

  return true;
}

// POST - Lookup student
router.post('/lookup', async (req, res) => {
  try {
    const { studentID } = req.body;
    if (!studentID || studentID.trim() === '') return res.status(400).json({ success: false, error: 'Student ID is required' });
    const tid = studentID.trim();
    const col = req.db.collection('students');
    let student = await col.findOne({ studentID: tid, isActive: true });
    if (!student) student = await col.findOne({ studentID: { $regex: new RegExp(`^${tid}$`, 'i') }, isActive: true });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

    res.json({
      success: true,
      student: { studentID: student.studentID, name: student.name, stream: student.stream, semester: student.semester,
        parentPhone: student.parentPhone ? '****' + student.parentPhone.slice(-4) : null }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// POST - Register FCM Token
router.post('/register-fcm', async (req, res) => {
  try {
    const { studentID, fcmToken } = req.body;
    if (!studentID || !fcmToken) return res.status(400).json({ success: false, error: 'Missing parameters' });
    
    const tid = studentID.trim();
    const col = req.db.collection('students');
    
    // Create query to match case-insensitive
    const query = { studentID: { $regex: new RegExp(`^${tid}$`, 'i') }, isActive: true };
    const student = await col.findOne(query);
    
    if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

    // Add token to fcmTokens array without duplicates
    await col.updateOne(
      { _id: student._id },
      { $addToSet: { fcmTokens: fcmToken } }
    );

    res.json({ success: true, message: 'FCM Token registered' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// POST - Update Activity (Login)
router.post('/update-activity', async (req, res) => {
  try {
    const { studentID } = req.body;
    if (!studentID) return res.status(400).json({ success: false, error: 'Student ID is required' });
    
    const tid = studentID.trim();
    const col = req.db.collection('students');
    
    console.log(`[PARENTS] Activity update for: ${tid}`);
    
    await col.updateOne(
      { studentID: { $regex: new RegExp(`^${tid}$`, 'i') }, isActive: true },
      { $set: { lastLogin: new Date() } }
    );
    
    res.json({ success: true, message: 'Activity updated' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// POST - Update Notification Status
router.post('/update-notification-status', async (req, res) => {
  try {
    const { studentID, status } = req.body; // status: 'granted', 'denied', 'not_supported'
    if (!studentID || !status) return res.status(400).json({ success: false, error: 'Missing parameters' });
    
    const tid = studentID.trim();
    const col = req.db.collection('students');
    
    await col.updateOne(
      { studentID: { $regex: new RegExp(`^${tid}$`, 'i') }, isActive: true },
      { $set: { notificationStatus: status } }
    );
    
    res.json({ success: true, message: 'Notification status updated' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// POST - Logout (Clear activity)
router.post('/logout', async (req, res) => {
  try {
    const { studentID } = req.body;
    if (!studentID) return res.status(400).json({ success: false, error: 'Student ID is required' });
    
    const tid = studentID.trim();
    // Clear all push tokens and mark as denied on logout
    await req.db.collection('students').updateOne(
      { studentID: { $regex: new RegExp(`^${tid}$`, 'i') }, isActive: true },
      { 
        $set: { fcmTokens: [], notificationStatus: 'denied' }
      }
    );
    
    res.json({ success: true, message: 'Logged out and tokens cleared' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// GET - Parent Status Stats (for Non-Teaching Dashboard)
router.get('/status-report', async (req, res) => {
  try {
    const col = req.db.collection('students');
    const students = await col.find({ isActive: true }, {
      projection: { studentID: 1, name: 1, stream: 1, semester: 1, lastLogin: 1, notificationStatus: 1, fcmTokens: 1 }
    }).toArray();

    const total = students.length;
    const now = new Date();
    const oneDayAgo = now.getTime() - (24 * 60 * 60 * 1000);
    
    // Define "Active" exactly like the frontend does
    const activeCount = students.filter(s => {
      const isOnline = Array.isArray(s.fcmTokens) && s.fcmTokens.length > 0 && s.notificationStatus === 'granted';
      // If notifications are off, they are still "Active" if they have logged in recently
      const isRecent = s.lastLogin && (new Date(s.lastLogin).getTime() > oneDayAgo);
      return isOnline || isRecent;
    }).length;
    
    // Notifications ON count only includes those who actually have them granted
    const notificationsGranted = students.filter(s => s.notificationStatus === 'granted').length;

    res.json({
      success: true,
      summary: {
        total,
        active: activeCount,
        inactive: total - activeCount,
        notificationsGranted,
        notificationsDenied: total - notificationsGranted
      },
      students: students.map(s => ({
        studentID: s.studentID,
        name: s.name,
        stream: s.stream,
        semester: s.semester,
        lastLogin: s.lastLogin,
        notificationStatus: s.notificationStatus || 'pending',
        hasTokens: Array.isArray(s.fcmTokens) && s.fcmTokens.length > 0
      }))
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});


// GET - Daily attendance
router.get('/daily/:studentID', async (req, res) => {
  try {
    const { studentID } = req.params;
    const { date } = req.query;
    const student = await req.db.collection('students').findOne({ studentID: { $regex: new RegExp(`^${studentID}$`, 'i') }, isActive: true });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const targetDateStr = date || new Date().toISOString().split('T')[0];
    const query = { stream: { $regex: new RegExp(`^${student.stream}$`, 'i') }, semester: student.semester, ...buildDateQuery(targetDateStr) };
    const records = await req.db.collection('attendance').find(query).sort({ time: 1 }).toArray();

    // Filter to only relevant subjects for this student
    const filtered = records.filter(r => isRecordRelevant(r, student));

    const dailyAttendance = filtered.map(record => {
      const present = isStudentPresent(record.studentsPresent, student);
      return { subject: record.subject, time: record.time || 'N/A', status: present ? 'Present' : 'Absent', isPresent: present };
    });

    const presentCount = dailyAttendance.filter(a => a.isPresent).length;
    const totalClasses = dailyAttendance.length;

    res.json({
      success: true,
      student: { studentID: student.studentID, name: student.name, stream: student.stream, semester: student.semester },
      date: targetDateStr,
      attendance: dailyAttendance,
      summary: { totalClasses, present: presentCount, absent: totalClasses - presentCount, percentage: totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0 }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// GET - Full/Overall attendance
router.get('/full/:studentID', async (req, res) => {
  try {
    const { studentID } = req.params;
    const student = await req.db.collection('students').findOne({ studentID: { $regex: new RegExp(`^${studentID}$`, 'i') }, isActive: true });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const records = await req.db.collection('attendance').find({
      stream: { $regex: new RegExp(`^${student.stream}$`, 'i') }, semester: student.semester
    }).sort({ date: -1, time: 1 }).toArray();

    const filtered = records.filter(r => isRecordRelevant(r, student));

    const subjectMap = {};
    let totalPresent = 0, totalClasses = 0;

    filtered.forEach(record => {
      const subject = record.subject || 'UNKNOWN';
      const present = isStudentPresent(record.studentsPresent, student);
      if (!subjectMap[subject]) subjectMap[subject] = { total: 0, present: 0, absent: 0 };
      subjectMap[subject].total++;
      if (present) { subjectMap[subject].present++; totalPresent++; }
      else subjectMap[subject].absent++;
      totalClasses++;
    });

    const subjectWise = Object.entries(subjectMap).map(([subject, d]) => ({
      subject, totalClasses: d.total, present: d.present, absent: d.absent,
      percentage: d.total > 0 ? Math.round((d.present / d.total) * 100) : 0
    })).sort((a, b) => a.subject.localeCompare(b.subject));

    res.json({
      success: true,
      student: { studentID: student.studentID, name: student.name, stream: student.stream, semester: student.semester },
      overall: { totalClasses, present: totalPresent, absent: totalClasses - totalPresent, percentage: totalClasses > 0 ? Math.round((totalPresent / totalClasses) * 100) : 0 },
      subjectWise
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// GET - Recent 7 days
router.get('/recent/:studentID', async (req, res) => {
  try {
    const { studentID } = req.params;
    const student = await req.db.collection('students').findOne({ studentID: { $regex: new RegExp(`^${studentID}$`, 'i') }, isActive: true });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const dateStrings = [];
    for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); dateStrings.push(d.toISOString().split('T')[0]); }
    const endD = new Date(); endD.setHours(23, 59, 59, 999);
    const startD = new Date(); startD.setDate(startD.getDate() - 7); startD.setHours(0, 0, 0, 0);

    const records = await req.db.collection('attendance').find({
      stream: { $regex: new RegExp(`^${student.stream}$`, 'i') }, semester: student.semester,
      $or: [{ date: { $in: dateStrings } }, { date: { $gte: startD, $lte: endD } }]
    }).sort({ date: -1, time: 1 }).toArray();

    const filtered = records.filter(r => isRecordRelevant(r, student));

    const recentDays = {};
    filtered.forEach(record => {
      const dateStr = typeof record.date === 'string' ? record.date : new Date(record.date).toISOString().split('T')[0];
      const present = isStudentPresent(record.studentsPresent, student);
      if (!recentDays[dateStr]) recentDays[dateStr] = { date: dateStr, classes: [], present: 0, absent: 0, total: 0 };
      recentDays[dateStr].classes.push({ subject: record.subject, time: record.time, isPresent: present });
      recentDays[dateStr].total++;
      if (present) recentDays[dateStr].present++; else recentDays[dateStr].absent++;
    });

    res.json({
      success: true,
      student: { studentID: student.studentID, name: student.name, stream: student.stream, semester: student.semester },
      recent: Object.values(recentDays).sort((a, b) => b.date.localeCompare(a.date))
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;
