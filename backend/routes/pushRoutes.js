const express = require('express');
const router = express.Router();

router.use((req, res, next) => {
  const db = req.app.locals.db || req.app.get('db');
  if (!db) return res.status(503).json({ success: false, error: 'Database unavailable' });
  req.db = db;
  next();
});

// GET - Get VAPID public key
router.get('/vapid-public-key', (req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(500).json({ success: false, error: 'VAPID keys not configured on backend' });
  }
  res.json({ success: true, publicKey });
});

// POST - Register FCM device token or Web Push subscription
router.post('/register', async (req, res) => {
  try {
    const { studentID, token, subscription, platform } = req.body;
    if (!studentID) {
      return res.status(400).json({ success: false, error: 'studentID is required' });
    }
    
    const tid = studentID.trim();
    const col = req.db.collection('students');
    const student = await col.findOne({ studentID: { $regex: new RegExp(`^${tid}$`, 'i') }, isActive: true });
    
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found.' });
    }

    if (platform === 'ios' || subscription) {
      // Validate subscription object
      if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ success: false, error: 'Invalid subscription object' });
      }
      
      // Store subscription in webPushSubscriptions array without duplicates
      const subscriptions = student.webPushSubscriptions || [];
      const exists = subscriptions.some(s => s.endpoint === subscription.endpoint);
      
      if (!exists) {
        await col.updateOne(
          { _id: student._id },
          { 
            $addToSet: { webPushSubscriptions: subscription },
            $set: { notificationStatus: 'granted' }
          }
        );
        console.log(`[PUSH] Registered standard Web Push subscription for student: ${student.studentID}`);
      } else {
        await col.updateOne(
          { _id: student._id },
          { $set: { notificationStatus: 'granted' } }
        );
      }
    } else if (platform === 'android' || token) {
      // Store Android FCM token
      const fcmToken = (token && token.value) || token; // handle both object structure or raw string
      if (!fcmToken || typeof fcmToken !== 'string') {
        return res.status(400).json({ success: false, error: 'Invalid token' });
      }

      await col.updateOne(
        { _id: student._id },
        { 
          $addToSet: { fcmTokens: fcmToken },
          $set: { notificationStatus: 'granted' }
        }
      );
      console.log(`[PUSH] Registered Android FCM token for student: ${student.studentID}`);
    } else {
      return res.status(400).json({ success: false, error: 'Missing token or subscription data' });
    }
    
    res.json({ success: true, message: 'Push notification channel registered successfully' });
  } catch (error) {
    console.error('❌ [PUSH] Registration error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
