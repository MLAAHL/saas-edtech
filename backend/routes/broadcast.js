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

/**
 * Deliver one message to a resolved list of students, over both channels.
 *
 * Split out from the route so an announcement can be pushed with exactly the
 * same delivery, expiry and dead-token handling as a broadcast — two code paths
 * sending notifications would drift, and the one that drifted would be the one
 * nobody was watching.
 */
// Where tapping the notification should land. A tab inside the app, or a link
// out. Whitelisted, because the value is handed straight to the app's own
// navigation, and http(s) only so a stored link can never become a javascript:
// payload on someone's phone.
const TABS = ['daily', 'full', 'insights', 'profile'];

function readAction(body) {
  const tab = TABS.includes(String(body.actionTab || '').trim())
    ? String(body.actionTab).trim() : '';
  const raw = String(body.linkUrl || '').trim();
  const link = /^https?:\/\//i.test(raw) ? raw.slice(0, 500) : '';
  // One destination, never both — a tap can only go to one place.
  return tab ? { actionTab: tab, linkUrl: '' } : { actionTab: '', linkUrl: link };
}

async function deliver(db, students, title, body, personalised, action = {}) {
  const col = db.collection('students');
  const actionTab = action.actionTab || '';
  const linkUrl = action.linkUrl || '';
  const messages = [];
  const tokenOwner = {};
  const webPushTasks = [];
  const dbUpdateTasks = [];

  students.forEach(student => {
    const t = personalised ? personalise(title, student) : title;
    const b = personalised ? personalise(body, student) : body;
    const unread = (student.unreadNotificationCount || 0) + 1;

    if ((student.fcmTokens || []).length > 0) {
      dbUpdateTasks.push(col.updateOne({ _id: student._id }, { $inc: { unreadNotificationCount: 1 } }));

      student.fcmTokens.forEach(token => {
        if (!token || typeof token !== 'string' || tokenOwner[token]) return;
        tokenOwner[token] = student._id;
        messages.push({
          token,
          notification: { title: t, body: b },
          // Every value in an FCM data payload must be a string.
          data: {
            type: 'announcement', title: t, body: b,
            actionTab, linkUrl,
            timestamp: Date.now().toString()
          },
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
        data: {
          type: 'announcement', actionTab, linkUrl,
          timestamp: Date.now().toString()
        }
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

  return { sent, failed, devices: messages.length + webPushTasks.length };
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

    const { sent, failed, devices } = await deliver(
      req.db, students, cleanTitle, cleanBody, personalised, readAction(req.body));

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
      devices,
      sent, failed,
      sentBy: req.user?.email || 'unknown',
      sentAt: new Date()
    });

    console.log(`📢 Announcement by ${req.user?.email}: ${sent} delivered, ${failed} failed, ${students.length} parents`);

    res.json({
      success: true,
      recipients: students.length,
      devices,
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

// ---------------------------------------------------------------------------
// SENDING IT LATER
// ---------------------------------------------------------------------------
//
// The times here are absolute instants, never wall-clock text: this server runs
// on UTC and the college does not, so a stored "09:00" would be the wrong nine
// o'clock. The browser sends the instant it means and the queue compares it
// against the clock.

const SCHEDULED = 'scheduled_notifications';
const MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

// POST /schedule
router.post('/schedule', async (req, res) => {
  try {
    const { title, body, studentIDs, stream, semester, personalised, sendAt } = req.body;

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

    const when = new Date(sendAt);
    if (isNaN(when.getTime())) {
      return res.status(400).json({ success: false, error: 'That send time is not a valid date.' });
    }
    // A minute of slack, so pressing the button on the minute you picked works.
    if (when.getTime() < Date.now() - 60 * 1000) {
      return res.status(400).json({ success: false, error: 'That time has already passed.' });
    }
    if (when.getTime() > Date.now() + MAX_AHEAD_MS) {
      return res.status(400).json({ success: false, error: 'Pick a time within the next 90 days.' });
    }

    const audience = (Array.isArray(studentIDs) && studentIDs.length)
      ? { studentIDs: studentIDs.map(s => String(s).trim()).filter(Boolean) }
      : { stream: stream || 'ALL', semester: semester || 'ALL' };

    const label = audience.studentIDs
      ? `${audience.studentIDs.length} chosen student(s)`
      : `${audience.stream === 'ALL' ? 'all streams' : audience.stream}` +
        `${audience.semester && audience.semester !== 'ALL' ? ' semester ' + audience.semester : ''}`;

    // Counted now so the panel can show the size of the send, but resolved
    // again at send time — a student who installs the app tomorrow morning
    // should still receive a notice queued tonight.
    const nowReachable = await resolveAudience(req.db, { ...audience, onlyReachable: true });

    const doc = {
      title: cleanTitle,
      body: cleanBody,
      personalised: !!personalised,
      action: readAction(req.body),
      audience,
      audienceLabel: label,
      sendAt: when,
      status: 'pending',
      reachableWhenQueued: nowReachable.length,
      createdBy: req.user?.email || 'unknown',
      createdAt: new Date()
    };

    const { insertedId } = await req.db.collection(SCHEDULED).insertOne(doc);

    console.log(`⏰ Notification queued by ${doc.createdBy} for ${when.toISOString()}: "${cleanTitle}"`);

    res.json({
      success: true,
      id: String(insertedId),
      sendAt: when,
      audienceLabel: label,
      reachable: nowReachable.length,
      message: `Queued. It will be sent automatically.`
    });
  } catch (error) {
    console.error('❌ Schedule error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /scheduled - what is waiting, and what recently went out.
router.get('/scheduled', async (req, res) => {
  try {
    const docs = await req.db.collection(SCHEDULED)
      .find({}).sort({ sendAt: -1 }).limit(40).toArray();

    res.json({
      success: true,
      scheduled: docs.map(d => ({
        id: String(d._id),
        title: d.title,
        body: d.body,
        audienceLabel: d.audienceLabel,
        sendAt: d.sendAt,
        status: d.status,
        personalised: !!d.personalised,
        reachableWhenQueued: d.reachableWhenQueued || 0,
        sent: d.sent || 0,
        failed: d.failed || 0,
        recipients: d.recipients || 0,
        note: d.note || '',
        createdBy: d.createdBy,
        createdAt: d.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /scheduled/:id - call it off, while it is still waiting.
router.delete('/scheduled/:id', async (req, res) => {
  try {
    const { ObjectId } = require('mongodb');
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Bad id' });
    }

    // Only while pending: once the queue has claimed it the message is already
    // on its way to Google and Apple, and cannot be recalled.
    const r = await req.db.collection(SCHEDULED).updateOne(
      { _id: new ObjectId(req.params.id), status: 'pending' },
      { $set: { status: 'cancelled', finishedAt: new Date(),
                cancelledBy: req.user?.email || 'unknown' } });

    if (r.matchedCount === 0) {
      return res.status(409).json({
        success: false,
        error: 'Too late — that one has already started sending.'
      });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;

// Shared with routes/announcements.js and the scheduler, so every notification
// goes through one sender rather than several that could drift apart.
module.exports.resolveAudience = resolveAudience;
module.exports.deliver = deliver;
