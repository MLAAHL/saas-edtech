// parentRoutes.js - Parent Portal API Routes (Read-Only)
const express = require('express');
const router = express.Router();
const firebaseAuth = require('../middleware/firebaseAuth');
const parentAuth = require('../middleware/parentAuth');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');

const resetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per window
    message: { success: false, error: 'Too many password reset requests from this IP, please try again after 15 minutes.' }
});

router.use((req, res, next) => {
  const db = req.app.locals.db || req.app.get('db');
  if (!db) return res.status(503).json({ success: false, error: 'Database unavailable' });
  req.db = db;
  // Prevent browser caching for all parent API routes to ensure real-time data
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return 0;
  let hour = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return hour * 60 + min;
}

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

// POST - Check if student exists and if parent password is set
router.post('/check-status', async (req, res) => {
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
      hasPassword: !!student.parentPassword
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// POST - Set parent password (First time login)
router.post('/set-password', async (req, res) => {
  try {
    const { studentID, password } = req.body;
    if (!studentID || !password) return res.status(400).json({ success: false, error: 'Student ID and password are required' });
    const tid = studentID.trim();
    // Escape regex characters to prevent NoSQL injection
    const escapedTid = tid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const col = req.db.collection('students');
    
    let student = await col.findOne({ studentID: { $regex: new RegExp(`^${escapedTid}$`, 'i') }, isActive: true });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

    if (student.parentPassword) return res.status(400).json({ success: false, error: 'Password already set' });

    // Hash the password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);
    await col.updateOne({ _id: student._id }, { $set: { parentPassword: hashedPassword } });

    res.json({ success: true });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// POST - Parent Login
router.post('/login', async (req, res) => {
  try {
    const { studentID, password } = req.body;
    if (!studentID || !password) return res.status(400).json({ success: false, error: 'Student ID and password required' });
    const tid = studentID.trim();
    // Escape regex characters to prevent NoSQL injection
    const escapedTid = tid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const col = req.db.collection('students');
    
    let student = await col.findOne({ studentID: { $regex: new RegExp(`^${escapedTid}$`, 'i') }, isActive: true });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });
    if (!student.parentPassword) return res.status(400).json({ success: false, error: 'Password not set for this account' });

    // Verify password with Bcrypt and fallback to SHA-256 for migration
    let isMatch = false;
    if (student.parentPassword.startsWith('$2b$') || student.parentPassword.startsWith('$2a$')) {
      isMatch = await bcrypt.compare(password, student.parentPassword);
    } else {
      // Fallback check using SHA256
      const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
      if (student.parentPassword === sha256Hash) {
        isMatch = true;
        // Transparently upgrade to bcrypt
        const bcryptHash = await bcrypt.hash(password, 10);
        await col.updateOne({ _id: student._id }, { $set: { parentPassword: bcryptHash } });
        console.log(`[PARENTS] Upgraded password hash to bcrypt for: ${student.studentID}`);
      }
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'fallback_parent_secret_key_123';
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'smart_parent_portal_jwt_refresh_secret_key_987';

    const jwtVersion = student.jwtVersion || 1;

    // Issue tokens: 15-minute access token, 30-day refresh token
    const token = jwt.sign({ studentID: student.studentID, jwtVersion }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ studentID: student.studentID, jwtVersion }, JWT_REFRESH_SECRET, { expiresIn: '30d' });

    // Set refresh token cookie (httpOnly, secure, sameSite: none)
    res.cookie('parentRefreshToken', refreshToken, {
      httpOnly: true,
      secure: true, // required for sameSite: 'none'
      sameSite: 'none',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    await col.updateOne({ _id: student._id }, { $set: { 'parentAuth.lastLogin': new Date(), appStatus: 'active' } });

    res.json({
      success: true,
      token,
      student: { studentID: student.studentID, name: student.name, stream: student.stream, semester: student.semester }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// GET - Get current parent/student info (Auto-login)
router.get('/me', parentAuth, async (req, res) => {
  try {
    const studentID = req.parentSession.studentID;
    const col = req.db.collection('students');
    const student = await col.findOne({ studentID: { $regex: new RegExp(`^${studentID}$`, 'i') }, isActive: true });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });
    
    res.json({
      success: true,
      student: { studentID: student.studentID, name: student.name, stream: student.stream, semester: student.semester }
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
router.post('/update-activity', parentAuth, async (req, res) => {
  try {
    const { studentID } = req.body;
    if (!studentID) return res.status(400).json({ success: false, error: 'Student ID is required' });
    
    const tid = studentID.trim();
    const col = req.db.collection('students');
    
    console.log(`[PARENTS] Activity update for: ${tid}`);
    
    await col.updateOne(
      { studentID: { $regex: new RegExp(`^${tid}$`, 'i') }, isActive: true },
      { $set: { lastLogin: new Date(), appStatus: 'active' } }
    );
    
    res.json({ success: true, message: 'Activity updated' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// POST - Update Notification Status
router.post('/update-notification-status', parentAuth, async (req, res) => {
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
router.post('/logout', parentAuth, async (req, res) => {
  try {
    const { fcmToken, reason } = req.body;
    const studentID = req.parentSession.studentID;
    const tid = studentID.trim();
    
    // Create the update payload
    let updatePayload = {
      $set: { 
        appStatus: 'logged_out',
        lastLogout: new Date(),
        logoutReason: reason || 'user_logout'
      }
    };
    
    // If fcmToken is provided, pull it from the array
    if (fcmToken) {
        updatePayload.$pull = { fcmTokens: fcmToken };
    } else {
        // Fallback: clear all if no specific token provided
        updatePayload.$set.fcmTokens = [];
    }

    await req.db.collection('students').updateOne(
      { studentID: { $regex: new RegExp(`^${tid}$`, 'i') }, isActive: true },
      updatePayload
    );
    
    // Clear the refresh token cookie
    res.clearCookie('parentRefreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none'
    });
    
    res.json({ success: true, message: 'Logged out and token cleared' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// POST - Admin reset parent password
router.post('/admin-reset-password', resetLimiter, firebaseAuth, async (req, res) => {
  try {
    const { studentID } = req.body;
    if (!studentID) return res.status(400).json({ success: false, error: 'Student ID required' });
    
    const db = req.db;
    const col = db.collection('students');
    const student = await col.findOne({ studentID: { $regex: new RegExp(`^${studentID.trim()}$`, 'i') } });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });
    
    const newJwtVersion = Date.now();
    await col.updateOne(
        { _id: student._id }, 
        { 
            $unset: { parentPassword: "" },
            $set: { jwtVersion: newJwtVersion, appStatus: 'logged_out', fcmTokens: [] }
        }
    );
    
    // Audit Log
    await db.collection('adminLogs').insertOne({
        action: 'password_reset',
        performedBy: req.user.email,
        targetStudentId: student.studentID,
        timestamp: new Date(),
        ipAddress: req.ip
    });
    
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Admin bulk reset parents
router.post('/bulk-reset', resetLimiter, firebaseAuth, async (req, res) => {
  try {
    const { studentIDs } = req.body;
    if (!Array.isArray(studentIDs) || studentIDs.length === 0) {
        return res.status(400).json({ success: false, error: 'Valid array of student IDs required' });
    }
    
    const db = req.db;
    const col = db.collection('students');
    
    const newJwtVersion = Date.now();
    
    // Use regex to match all IDs case-insensitively
    const idRegexes = studentIDs.map(id => new RegExp(`^${id.trim()}$`, 'i'));
    
    const result = await col.updateMany(
        { studentID: { $in: idRegexes } }, 
        { 
            $unset: { parentPassword: "" },
            $set: { jwtVersion: newJwtVersion, appStatus: 'logged_out', fcmTokens: [] }
        }
    );
    
    // Audit Log
    await db.collection('adminLogs').insertOne({
        action: 'bulk_password_reset',
        performedBy: req.user.email,
        targetCount: result.modifiedCount,
        timestamp: new Date(),
        ipAddress: req.ip
    });
    
    res.json({ success: true, message: `Successfully reset ${result.modifiedCount} accounts` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Parent Status Stats (for Non-Teaching Dashboard)
router.get('/status-report', firebaseAuth, async (req, res) => {
  try {
    const col = req.db.collection('students');
    const students = await col.find({ isActive: true }, {
      projection: { 
        studentID: 1, name: 1, stream: 1, semester: 1, lastLogin: 1, fcmTokens: 1,
        appStatus: 1, appRemovedAt: 1, lastLogout: 1, logoutReason: 1,
        notificationStatus: 1, notificationRevokedAt: 1, lastNotificationSent: 1, 
        lastNotificationDelivered: 1, lastNotificationFailed: 1 
      }
    }).toArray();

    // Summary counts can be handled by the frontend, but we return a basic total here
    const total = students.length;

    res.json({
      success: true,
      summary: { total }, // Detail processing moved to frontend for precise states
      students: students.map(s => {
        const hasTokens = Array.isArray(s.fcmTokens) && s.fcmTokens.length > 0;
        
        let computedAppStatus = s.appStatus;
        if (!computedAppStatus) {
            const isRecentLogin = s.lastLogin && (new Date() - new Date(s.lastLogin) < 24 * 60 * 60 * 1000);
            if (isRecentLogin || hasTokens) {
                computedAppStatus = 'active';
            } else if (s.lastLogin) {
                computedAppStatus = 'logged_out'; 
            } else {
                computedAppStatus = 'never_registered';
            }
        }
        
        let computedNotifStatus = s.notificationStatus;
        if (!computedNotifStatus || computedNotifStatus === 'pending') {
            computedNotifStatus = hasTokens ? 'granted' : 'not_asked';
        }

        return {
          studentID: s.studentID,
          name: s.name,
          stream: s.stream,
          semester: s.semester,
          lastLogin: s.lastLogin,
          hasTokens,
          appStatus: computedAppStatus,
          appRemovedAt: s.appRemovedAt,
          lastLogout: s.lastLogout,
          logoutReason: s.logoutReason,
          notificationStatus: computedNotifStatus,
          notificationRevokedAt: s.notificationRevokedAt,
          lastNotificationSent: s.lastNotificationSent,
          lastNotificationDelivered: s.lastNotificationDelivered,
          lastNotificationFailed: s.lastNotificationFailed
        };
      })
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});


// GET - Daily attendance
router.get('/daily/:studentID', parentAuth, async (req, res) => {
  try {
    const { studentID } = req.params;
    const { date } = req.query;
    const student = await req.db.collection('students').findOne({ studentID: { $regex: new RegExp(`^${studentID}$`, 'i') }, isActive: true });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const targetDateStr = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const query = { stream: { $regex: new RegExp(`^${student.stream}$`, 'i') }, semester: student.semester, isDeleted: { $ne: true }, ...buildDateQuery(targetDateStr) };
    const records = await req.db.collection('attendance').find(query).toArray();
    
    records.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));

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
router.get('/full/:studentID', parentAuth, async (req, res) => {
  try {
    const { studentID } = req.params;
    const student = await req.db.collection('students').findOne({ studentID: { $regex: new RegExp(`^${studentID}$`, 'i') }, isActive: true });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const records = await req.db.collection('attendance').find({
      stream: { $regex: new RegExp(`^${student.stream}$`, 'i') }, semester: student.semester, isDeleted: { $ne: true }
    }).sort({ date: -1 }).toArray();
    
    records.sort((a, b) => {
      const d1 = new Date(a.date).getTime();
      const d2 = new Date(b.date).getTime();
      if (d1 !== d2) return d2 - d1;
      return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
    });

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
router.get('/recent/:studentID', parentAuth, async (req, res) => {
  try {
    const { studentID } = req.params;
    const student = await req.db.collection('students').findOne({ studentID: { $regex: new RegExp(`^${studentID}$`, 'i') }, isActive: true });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const dateStrings = [];
    for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); dateStrings.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })); }
    const endD = new Date(); endD.setHours(23, 59, 59, 999);
    const startD = new Date(); startD.setDate(startD.getDate() - 7); startD.setHours(0, 0, 0, 0);

    const records = await req.db.collection('attendance').find({
      stream: { $regex: new RegExp(`^${student.stream}$`, 'i') }, semester: student.semester, isDeleted: { $ne: true },
      $or: [{ date: { $in: dateStrings } }, { date: { $gte: startD, $lte: endD } }]
    }).sort({ date: -1 }).toArray();
    
    records.sort((a, b) => {
      const d1 = new Date(a.date).getTime();
      const d2 = new Date(b.date).getTime();
      if (d1 !== d2) return d2 - d1;
      return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
    });

    const filtered = records.filter(r => isRecordRelevant(r, student));

    const recentDays = {};
    filtered.forEach(record => {
      const dateStr = typeof record.date === 'string' ? record.date : new Date(record.date).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const present = isStudentPresent(record.studentsPresent, student);
      if (!recentDays[dateStr]) recentDays[dateStr] = { date: dateStr, classes: [], present: 0, absent: 0, total: 0 };
      recentDays[dateStr].classes.push({ subject: record.subject, time: record.time, isPresent: present });
      recentDays[dateStr].total++;
      if (present) recentDays[dateStr].present++; else recentDays[dateStr].absent++;
    });

    res.json({
      success: true,
      student: { studentID: student.studentID, name: student.name, stream: student.stream, semester: student.semester },
      recent: Object.values(recentDays).sort((a, b) => b.date.localeCompare(a.date)).map(day => {
        day.classes.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
        return day;
      })
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// GET - UUCMS dashboard data for a student
router.get('/dashboard/:studentID', parentAuth, async (req, res) => {
  try {
    const { studentID } = req.params;
    const tid = studentID.trim();
    
    // 1. Get student
    const student = await req.db.collection('students').findOne({ studentID: { $regex: new RegExp(`^${tid}$`, 'i') }, isActive: true });
    if (!student) return res.status(404).json({ success: false, error: 'Student not found.' });

    // 2. Fetch cache from Upstash Redis using the student's register number or studentID
    const uucmsId = student.registerNumber || student.studentID || tid;
    
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    if (!upstashUrl || !upstashToken) {
      return res.status(503).json({
        success: false,
        error: 'UUCMS Sync service unavailable (credentials not configured)'
      });
    }

    const axios = require('axios');
    
    // Helper to fetch key from Upstash Redis REST API
    const fetchKey = async (key) => {
      try {
        const response = await axios.get(`${upstashUrl}/get/${key}`, {
          headers: { Authorization: `Bearer ${upstashToken}` },
          timeout: 5000
        });
        if (response.data && response.data.result) {
          return JSON.parse(response.data.result);
        }
        return null;
      } catch (err) {
        console.error(`[PARENTS] Failed to fetch cache for key ${key}: ${err.message}`);
        return null;
      }
    };

    // Fetch profile, ia-marks, results, attendance concurrently
    const [profile, iaMarks, results, attendance] = await Promise.all([
      fetchKey(`uucms:cache:${uucmsId}:profile`),
      fetchKey(`uucms:cache:${uucmsId}:ia-marks`),
      fetchKey(`uucms:cache:${uucmsId}:results`),
      fetchKey(`uucms:cache:${uucmsId}:attendance`)
    ]);

    // Check if we got any data
    if (!profile && !iaMarks && !results && !attendance) {
      return res.json({
        success: true,
        uucmsAttendance: null,
        uucmsResults: null,
        uucmsMarks: null,
        syncStatus: {
          lastSynced: null,
          isSyncing: student.syncStatus?.isSyncing || false,
          error: student.syncStatus?.error || 'No academic data synced yet.'
        }
      });
    }

    // 3. Format overall attendance percentage
    const latestAttendanceSem = attendance?.semesters && attendance.semesters.length > 0
      ? attendance.semesters[attendance.semesters.length - 1]
      : null;

    let overallPercentage = '--';
    if (latestAttendanceSem && latestAttendanceSem.subjects) {
      let totalPct = 0;
      let subjectCount = 0;
      latestAttendanceSem.subjects.forEach(sub => {
        if (sub.percentage !== undefined) {
          totalPct += sub.percentage;
          subjectCount++;
        }
      });
      if (subjectCount > 0) {
        overallPercentage = Math.round(totalPct / subjectCount);
      }
    } else if (profile && profile.overallPercentage !== undefined) {
      overallPercentage = profile.overallPercentage;
    }

    const uucmsAttendance = {
      overallPercentage
    };

    // 4. Format exam results
    const latestResultSem = results?.semesters && results.semesters.length > 0
      ? results.semesters[results.semesters.length - 1]
      : null;

    const uucmsResults = latestResultSem ? {
      semester: latestResultSem.termName,
      sgpa: latestResultSem.sgpa || results.sgpa || '0',
      cgpa: latestResultSem.cgpa || results.cgpa || '0',
      resultStatus: latestResultSem.result || 'Declared',
      subjects: (latestResultSem.subjects || []).map(s => ({
        subjectName: s.name,
        totalMarks: s.marksScored,
        internalMarks: s.iaMarks,
        externalMarks: s.seeMarks,
        grade: s.letterGrade,
        result: s.result
      }))
    } : null;

    // 5. Format internal assessment marks
    const latestMarksSem = iaMarks?.semesters && iaMarks.semesters.length > 0
      ? iaMarks.semesters[iaMarks.semesters.length - 1]
      : null;

    const uucmsMarks = { subjects: [] };
    if (latestMarksSem && latestMarksSem.subjects) {
      const subjectsMap = {};
      latestMarksSem.subjects.forEach(sub => {
        const key = sub.courseName || sub.courseCode || 'Unknown';
        if (!subjectsMap[key]) {
          subjectsMap[key] = {
            subjectName: key,
            totalObtained: 0,
            totalMax: 0,
            components: []
          };
        }
        subjectsMap[key].totalObtained += sub.marksScored || 0;
        subjectsMap[key].totalMax += sub.maxMarks || 0;
        subjectsMap[key].components.push({
          name: sub.component || 'Internal',
          obtainedMarks: sub.marksScored || 0
        });
      });
      uucmsMarks.subjects = Object.values(subjectsMap);
    }

    // 6. Format sync status
    const lastSyncedTime = results?.lastSync || iaMarks?.lastSync || attendance?.lastSync || profile?.lastSynced || new Date();
    const syncStatus = {
      lastSynced: lastSyncedTime,
      isSyncing: student.syncStatus?.isSyncing || false,
      error: student.syncStatus?.error || null
    };

    res.json({
      success: true,
      uucmsAttendance,
      uucmsResults,
      uucmsMarks,
      syncStatus,
      rawResults: results,
      rawIaMarks: iaMarks,
      rawAttendance: attendance
    });

  } catch (error) {
    console.error('[PARENTS] Dashboard sync error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
