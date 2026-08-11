// Notifications queued for later.
//
// A notice written at midnight should not wake six hundred families at
// midnight. The message is stored and sent at the hour it was set for.
//
// The queue lives in the database rather than in a timer in memory, so a
// restart or a deploy never loses a pending send — on boot this picks up
// whatever is still due.

const broadcast = require('../routes/broadcast');

const COLLECTION = 'scheduled_notifications';

// How often the queue is checked. A minute's precision is ample for a notice
// aimed at "tomorrow morning", and it keeps the database almost untouched.
const TICK_MS = 30 * 1000;

// If the server was down when a send fell due, it still goes out — but only
// while it is still the message the sender meant. Two hours late is a delayed
// notice; two days late is a confusing one, so that is recorded and dropped.
const GRACE_MS = 2 * 60 * 60 * 1000;

let timer = null;
let running = false;

async function claimOne(db) {
  const now = new Date();
  // findOneAndUpdate is atomic, so a slow send overlapping the next tick can
  // never pick up the same message twice.
  const res = await db.collection(COLLECTION).findOneAndUpdate(
    { status: 'pending', sendAt: { $lte: now } },
    { $set: { status: 'sending', startedAt: now } },
    { sort: { sendAt: 1 }, returnDocument: 'after' }
  );
  return res && (res.value || res);
}

async function runOne(db, job) {
  const late = Date.now() - new Date(job.sendAt).getTime();

  if (late > GRACE_MS) {
    await db.collection(COLLECTION).updateOne({ _id: job._id }, {
      $set: {
        status: 'missed',
        finishedAt: new Date(),
        note: `Was due ${Math.round(late / 60000)} minutes before the server got to it, ` +
              `so it was not sent.`
      }
    });
    console.warn(`⏰ Scheduled notification "${job.title}" missed its window by ` +
                 `${Math.round(late / 60000)} min — not sent.`);
    return;
  }

  try {
    const students = await broadcast.resolveAudience(db, {
      ...(job.audience || {}), onlyReachable: true
    });

    if (students.length === 0) {
      await db.collection(COLLECTION).updateOne({ _id: job._id }, {
        $set: {
          status: 'sent', finishedAt: new Date(),
          sent: 0, failed: 0, recipients: 0,
          note: 'Nobody in that group had the app with notifications on.'
        }
      });
      return;
    }

    const { sent, failed, devices } = await broadcast.deliver(
      db, students, job.title, job.body, !!job.personalised, job.action || {});

    await db.collection(COLLECTION).updateOne({ _id: job._id }, {
      $set: {
        status: 'sent', finishedAt: new Date(),
        sent, failed, devices, recipients: students.length
      }
    });

    await db.collection('notification_logs').insertOne({
      type: 'scheduled',
      title: job.title,
      body: job.body,
      personalised: !!job.personalised,
      audience: job.audienceLabel || 'scheduled',
      recipients: students.length,
      devices, sent, failed,
      sentBy: job.createdBy || 'scheduler',
      scheduledFor: job.sendAt,
      sentAt: new Date()
    });

    console.log(`⏰ Scheduled notification "${job.title}" sent: ` +
                `${sent} delivered, ${failed} failed, ${students.length} parents`);
  } catch (error) {
    // Left as failed rather than returned to pending: a message that threw once
    // will usually throw again, and retrying in a loop would be worse than
    // showing the admin that it did not go.
    await db.collection(COLLECTION).updateOne({ _id: job._id }, {
      $set: { status: 'failed', finishedAt: new Date(), note: error.message }
    });
    console.error(`❌ Scheduled notification "${job.title}" failed:`, error.message);
  }
}

async function tick(getDb) {
  if (running) return;              // a long send must not overlap the next tick
  const db = getDb();
  if (!db) return;

  running = true;
  try {
    let job;
    while ((job = await claimOne(db))) {
      await runOne(db, job);
    }
  } catch (error) {
    console.error('❌ Scheduled notification sweep failed:', error.message);
  } finally {
    running = false;
  }
}

function start(getDb) {
  if (timer) return;

  // Anything left mid-send by a restart is put back, so a deploy at the wrong
  // moment delays a notice rather than losing it.
  Promise.resolve().then(async () => {
    const db = getDb();
    if (!db) return;
    const r = await db.collection(COLLECTION).updateMany(
      { status: 'sending' },
      { $set: { status: 'pending' }, $unset: { startedAt: '' } });
    if (r.modifiedCount) {
      console.log(`⏰ ${r.modifiedCount} scheduled notification(s) were interrupted ` +
                  `by a restart and are queued again.`);
    }
  }).catch(() => {});

  timer = setInterval(() => tick(getDb), TICK_MS);
  timer.unref?.();
  console.log('⏰ Scheduled notifications: queue is being watched');
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, COLLECTION, GRACE_MS };
