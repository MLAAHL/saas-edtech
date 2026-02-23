const express = require('express');
const router = express.Router();
const admin = require('../config/firebase-admin');

// Check if Firebase is initialized
if (!admin.apps || !admin.apps.length) {
    console.warn('⚠️ Firebase Admin not initialized - push notifications may not work');
}

// ============================================================================
// SEND NOTIFICATION TO SPECIFIC USER (by FCM token)
// ============================================================================
router.post('/send', async (req, res) => {
    try {
        const { token, title, body, data, imageUrl } = req.body;

        if (!token || !title || !body) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: token, title, body'
            });
        }

        const message = {
            token: token,
            notification: {
                title: title,
                body: body
            },
            data: data || {},
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    clickAction: 'FLUTTER_NOTIFICATION_CLICK',
                    channelId: 'smart_attendance_channel'
                }
            },
            apns: {
                payload: {
                    aps: {
                        sound: 'default',
                        badge: 1
                    }
                }
            }
        };

        if (imageUrl) {
            message.notification.imageUrl = imageUrl;
        }

        const response = await admin.messaging().send(message);

        console.log('📬 Notification sent:', response);

        res.json({
            success: true,
            messageId: response
        });

    } catch (error) {
        console.error('❌ Error sending notification:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// SEND NOTIFICATION TO TOPIC (e.g., all_users, teachers, students)
// ============================================================================
router.post('/send-topic', async (req, res) => {
    try {
        const { topic, title, body, data, imageUrl } = req.body;

        if (!topic || !title || !body) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: topic, title, body'
            });
        }

        const message = {
            topic: topic,
            notification: {
                title: title,
                body: body
            },
            data: data || {},
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'smart_attendance_channel'
                }
            }
        };

        if (imageUrl) {
            message.notification.imageUrl = imageUrl;
        }

        const response = await admin.messaging().send(message);

        console.log('📬 Topic notification sent:', response);

        res.json({
            success: true,
            messageId: response
        });

    } catch (error) {
        console.error('❌ Error sending topic notification:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// SEND TO MULTIPLE USERS (batch)
// ============================================================================
router.post('/send-batch', async (req, res) => {
    try {
        const { tokens, title, body, data } = req.body;

        if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Missing or invalid tokens array'
            });
        }

        if (!title || !body) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: title, body'
            });
        }

        const message = {
            notification: {
                title: title,
                body: body
            },
            data: data || {},
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'smart_attendance_channel'
                }
            }
        };

        const response = await admin.messaging().sendEachForMulticast({
            tokens: tokens,
            ...message
        });

        console.log('📬 Batch notifications sent:', response.successCount, 'success,', response.failureCount, 'failed');

        res.json({
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount
        });

    } catch (error) {
        console.error('❌ Error sending batch notification:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// SUBSCRIBE USER TO TOPIC
// ============================================================================
router.post('/subscribe', async (req, res) => {
    try {
        const { token, topic } = req.body;

        if (!token || !topic) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: token, topic'
            });
        }

        const response = await admin.messaging().subscribeToTopic(token, topic);

        console.log('✅ Subscribed to topic:', topic);

        res.json({
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount
        });

    } catch (error) {
        console.error('❌ Error subscribing to topic:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// UNSUBSCRIBE USER FROM TOPIC
// ============================================================================
router.post('/unsubscribe', async (req, res) => {
    try {
        const { token, topic } = req.body;

        if (!token || !topic) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: token, topic'
            });
        }

        const response = await admin.messaging().unsubscribeFromTopic(token, topic);

        console.log('✅ Unsubscribed from topic:', topic);

        res.json({
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount
        });

    } catch (error) {
        console.error('❌ Error unsubscribing from topic:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// SEND ATTENDANCE REMINDER
// ============================================================================
router.post('/attendance-reminder', async (req, res) => {
    try {
        const { topic, stream, semester, subject } = req.body;

        const targetTopic = topic || 'teachers';

        const message = {
            topic: targetTopic,
            notification: {
                title: '📋 Attendance Reminder',
                body: subject
                    ? `Don't forget to mark attendance for ${subject}!`
                    : 'Don\'t forget to mark attendance today!'
            },
            data: {
                type: 'attendance_reminder',
                stream: stream || '',
                semester: semester || '',
                subject: subject || '',
                url: 'https://mlaahl.online/myclass.html'
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'smart_attendance_channel'
                }
            }
        };

        const response = await admin.messaging().send(message);

        console.log('📬 Attendance reminder sent:', response);

        res.json({
            success: true,
            messageId: response
        });

    } catch (error) {
        console.error('❌ Error sending attendance reminder:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// SEND ATTENDANCE MARKED NOTIFICATION
// ============================================================================
router.post('/attendance-marked', async (req, res) => {
    try {
        const { token, studentName, subject, status, date } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Missing FCM token'
            });
        }

        const statusEmoji = status === 'present' ? '✅' : '❌';
        const statusText = status === 'present' ? 'Present' : 'Absent';

        const message = {
            token: token,
            notification: {
                title: `${statusEmoji} Attendance Marked`,
                body: `${studentName || 'You'} marked ${statusText} for ${subject || 'class'} on ${date || 'today'}`
            },
            data: {
                type: 'attendance_marked',
                subject: subject || '',
                status: status || '',
                date: date || '',
                url: 'https://mlaahl.online/myclass.html#history'
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'smart_attendance_channel'
                }
            }
        };

        const response = await admin.messaging().send(message);

        console.log('📬 Attendance marked notification sent:', response);

        res.json({
            success: true,
            messageId: response
        });

    } catch (error) {
        console.error('❌ Error sending attendance marked notification:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
