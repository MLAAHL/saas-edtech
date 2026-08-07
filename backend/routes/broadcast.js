// Custom notifications to parents, sent from the admin panel.
//
// Kept apart from routes/notifications.js, which takes raw FCM tokens: an
// audience here is chosen by class or by student, and the server resolves the
// devices. That way the admin panel never handles tokens, and a message can
// only ever reach students that actually exist.

const express = require('express');
const router = express.Router();
const admin = require('../config/firebase-admin');
const webpush = require('web-push');
const firebaseAuth = require('../middleware/firebaseAuth');

router.use(firebaseAuth);

// Matches the absence alerts: hold for a day so a phone that is off or out of
// signal still receives the message when it comes back.
const ALERT_TTL_SECONDS = 24 * 60 * 60;
const ALERT_TTL_MS = ALERT_TTL_SECONDS * 1000;

const MAX_TITLE = 80;
const MAX_BODY = 500;

// {name} is replaced with the student's name, so one message can read
// personally to every parent without the sender writing 600 of them.
function personalise(template, student) {
  const name = (student.name || '').trim();
  const first = name.split(/\s+/)[0] || name;
  return String(template)
    .replace(/\{name\}/gi, name)
    .replace(/\{firstName\}/gi, first)
    .replace(/\{studentID\}/gi, student.studentID || '')
    .replace(/\{stream\}/gi, student.stream || '')
    .replace(/\{semester\}/gi, student.semester == null ? '' : String(student.semester));
}

/**
 * Resolve the audience. Either an explicit list of student IDs, or a class
 * filter, never both — an admin picking rows means those rows.
 */
async function resolveAudience(db, { studentIDs, stream, semester, onlyReachable }) {
  const query = { isActive: true };

  if (Array.isArray(studentIDs) && studentIDs.length > 0) {
    query.studentID = { $in: studentIDs.map(s => String(s).trim()).filter(Boolean) };
  } else {
    if (stream && stream !== 'ALL') {
      const safe = String(stream).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.stream = { $regex: new RegExp(`^${safe}$`, 'i') };
    }
    if (semester && semester !== 'ALL') {
      query.semester = parseInt(semester, 10);
    }
  }

  // Only students whose parent has a device we can actually reach.
  if (onlyReachable) {
    query.$or = [
      { fcmTokens: { $exists: true, $ne: [] } },
      { webPushSubscriptions: { $exists: true, $ne: [] } }
    ];
  }

  return db.collection('students').find(query, {
    projection: {
      studentID: 1, name: 1, stream: 1, semester: 1,
      fcmTokens: 1, webPushSubscriptions: 1, unreadNotificationCount: 1
    }
  }).sort({ stream: 1, semester: 1, name: 1 }).toArray();
}

// POST /preview - who would receive this, and how the message reads for them.
// Sending to hundreds of parents cannot be undone, so it is worth seeing first.
router.post('/preview', async (req, res) => {
  try {
    const { title, body, studentIDs, stream, semester, personalised } = req.body;
    const students = await resolveAudience(req.db, { studentIDs, stream, semester });

    const reachable = students.filter(s =>
      (s.fcmTokens || []).length > 0 || (s.webPushSubscriptions || []).length > 0);

    const sample = reachable.slice(0, 3).map(s => ({
      studentID: s.studentID,
      name: s.name,
      title: personalised ? personalise(title || '', s) : (title || ''),
      body: personalised ? personalise(body || '', s) : (body || '')
    }));

    const byClass = {};
    students.forEach(s => {
      const k = `${s.stream || '?'} Sem ${s.semester ?? '?'}`;
      byClass[k] = (byClass[k] || 0) + 1;
    });

    res.json({
      success: true,
      total: students.length,
      reachable: reachable.length,
      unreachable: students.length - reachable.length,
      byClass,
      sample
    });
  } catch (error) {
    console.error('❌ Broadcast preview error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /send - deliver the message.
router.post('/send', async (req, res) => {
  try {
    const { title, body, studentIDs, stream, semester, personalised } = req.body;

    const cleanTitle = String(title || '').trim();
    const cleanBody = String(body || '').trim();
    if (!cleanTitle || !cleanBody) {
      return res.status(400).json({ success: false, error: 'A title and a message are required.' });
    }
    if (cleanTitle.length > MAX_TITLE || cleanBody.length > MAX_BODY) {
      return res.status(400).json({
        success: false,
        error: `Keep the title under ${MAX_TITLE} characters and the message under ${MAX_BODY}.`
      });
    }

    const students = await resolveAudience(req.db, {
      studentIDs, stream, semester, onlyReachable: true
    });

    if (students.length === 0) {
      return res.json({
        success: true, sent: 0, failed: 0, recipients: 0,
        message: 'Nobody in that selection has the parent app installed with notifications on.'
      });
    }

    const col = req.db.collection('students');
    const messages = [];
    const tokenOwner = {};
    const webPushTasks = [];
    const dbUpdateTasks = [];

    students.forEach(student => {
      const t = personalised ? personalise(cleanTitle, student) : cleanTitle;
      const b = personalised ? personalise(cleanBody, student) : cleanBody;
      const unread = (student.unreadNotificationCount || 0) + 1;

      if ((student.fcmTokens || []).length > 0) {
        dbUpdateTasks.push(col.updateOne({ _id: student._id }, { $inc: { unreadNotificationCount: 1 } }));

        student.fcmTokens.forEach(token => {
          if (!token || typeof token !== 'string' || tokenOwner[token]) return;
          tokenOwner[token] = student._id;
          messages.push({
            token,
            notification: { title: t, body: b },
            data: { type: 'announcement', title: t, body: b, timestamp: Date.now().toString() },
            android: {
              priority: 'high',
              ttl: ALERT_TTL_MS,
              notification: {
                title: t, body: b, sound: 'default',
                channelId: 'attendance_alerts', priority: 'max',
                notificationCount: unread, defaultVibrateTimings: true, visibility: 'public'
              }
            },
            apns: {
              headers: {
                'apns-priority': '10',
                'apns-push-type': 'alert',
                'apns-expiration': String(Math.floor(Date.now() / 1000) + ALERT_TTL_SECONDS)
              },
              payload: { aps: { alert: { title: t, body: b }, sound: 'default', badge: unread } }
            }
          });
        });
      }

      (student.webPushSubscriptions || []).forEach(sub => {
        if (!sub || !sub.endpoint) return;
        const payload = JSON.stringify({
          title: t, body: b,
          data: { type: 'announcement', timestamp: Date.now().toString() }
        });
        webPushTasks.push(
          webpush.sendNotification(sub, payload, { urgency: 'high', TTL: ALERT_TTL_SECONDS })
            .then(() => true)
            .catch(err => {
              if (err.statusCode === 410 || err.statusCode === 404) {
                dbUpdateTasks.push(col.updateOne(
                  { _id: student._id },
                  { $pull: { webPushSubscriptions: sub }, $set: { notificationStatus: 'revoked' } }
                ));
              }
              return false;
            })
        );
      });
    });

    let sent = 0, failed = 0;

    // sendEach caps at 500 messages per call.
    const tokens = messages.map(m => m.token);
    for (let i = 0; i < messages.length; i += 500) {
      const chunk = messages.slice(i, i + 500);
      const response = await admin.messaging().sendEach(chunk);
      sent += response.successCount;
      failed += response.failureCount;

      response.responses.forEach((r, idx) => {
        if (r.success) return;
        const token = tokens[i + idx];
        const code = r.error?.code || '';
        // A dead token is dropped so the next send does not retry it.
        if (code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument') {
          dbUpdateTasks.push(col.updateOne(
            { _id: tokenOwner[token] },
            { $pull: { fcmTokens: token }, $set: { appStatus: 'app_removed', appRemovedAt: new Date() } }
          ));
        }
      });
    }

    if (webPushTasks.length > 0) {
      const results = await Promise.allSettled(webPushTasks);
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value === true) sent++;
        else failed++;
      });
    }

    // Not awaited: the admin does not wait on bookkeeping.
    if (dbUpdateTasks.length > 0) {
      Promise.allSettled(dbUpdateTasks).catch(() => {});
    }

    const audience = (Array.isArray(studentIDs) && studentIDs.length)
      ? `${students.length} selected student(s)`
      : `${stream || 'all streams'}${semester && semester !== 'ALL' ? ' sem ' + semester : ''}`;

    await req.db.collection('notification_logs').insertOne({
      type: 'announcement',
      title: cleanTitle,
      body: cleanBody,
      personalised: !!personalised,
      audience,
      recipients: students.length,
      devices: messages.length + webPushTasks.length,
      sent, failed,
      sentBy: req.user?.email || 'unknown',
      sentAt: new Date()
    });

    console.log(`📢 Announcement by ${req.user?.email}: ${sent} delivered, ${failed} failed, ${students.length} parents`);

    res.json({
      success: true,
      recipients: students.length,
      devices: messages.length + webPushTasks.length,
      sent,
      failed,
      message: `Delivered to ${sent} device(s) across ${students.length} parent(s).` +
               (failed ? ` ${failed} failed.` : '')
    });
  } catch (error) {
    console.error('❌ Broadcast send error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /history - what has been sent before, so an admin can see whether a
// message already went out rather than sending it twice.
router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const logs = await req.db.collection('notification_logs')
      .find({ type: 'announcement' })
      .sort({ sentAt: -1 })
      .limit(limit)
      .toArray();
    res.json({ success: true, logs });
  } catch (error) {
    console.error('❌ Broadcast history error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
