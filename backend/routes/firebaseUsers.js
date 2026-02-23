const express = require('express');
const router = express.Router();
const admin = require('../config/firebase-admin');

// List All Users
router.get('/', async (req, res) => {
    try {
        const listUsersResult = await admin.auth().listUsers(1000);
        const firebaseUsers = listUsersResult.users;

        // Fetch all teacher profiles from MongoDB to match with Firebase users
        const db = req.app.locals.db;

        if (!db) {
            console.error('❌ [FIREBASE-USERS] Database not available in app.locals.db');
            throw new Error('Database connection not available');
        }

        const profiles = await db.collection('teachers').find({}).toArray();
        const profileMap = {};
        profiles.forEach(p => {
            if (p.email) profileMap[p.email.toLowerCase()] = p.profileImageUrl || '';
        });

        const users = firebaseUsers.map(user => ({
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            disabled: user.disabled,
            creationTime: user.metadata.creationTime,
            lastSignInTime: user.metadata.lastSignInTime,
            profileImageUrl: profileMap[(user.email || '').toLowerCase()] || ''
        }));

        res.json({
            success: true,
            users
        });
    } catch (error) {
        console.error('❌ [FIREBASE-USERS] Error listing users:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch Firebase users: ' + error.message
        });
    }
});

// Create User
router.post('/', async (req, res) => {
    try {
        const { email, password, displayName } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: displayName || email.split('@')[0]
        });

        console.log(`✅ [FIREBASE-USERS] Created user: ${userRecord.uid}`);

        res.status(201).json({
            success: true,
            user: {
                uid: userRecord.uid,
                email: userRecord.email
            }
        });
    } catch (error) {
        console.error('❌ [FIREBASE-USERS] Error creating user:', error.message);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Update User (e.g. Password)
router.put('/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        const { password, displayName, disabled } = req.body;

        const updateData = {};
        if (password) updateData.password = password;
        if (displayName) updateData.displayName = displayName;
        if (typeof disabled !== 'undefined') updateData.disabled = disabled;

        const updatedUser = await admin.auth().updateUser(uid, updateData);

        console.log(`✅ [FIREBASE-USERS] Updated user: ${uid}`);

        res.json({
            success: true,
            message: 'User updated successfully'
        });
    } catch (error) {
        console.error('❌ [FIREBASE-USERS] Error updating user:', error.message);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Toggle Disable
router.patch('/:uid/disable', async (req, res) => {
    try {
        const { uid } = req.params;
        const { disabled } = req.body;

        await admin.auth().updateUser(uid, { disabled });

        res.json({
            success: true,
            message: `User ${disabled ? 'disabled' : 'enabled'} successfully`
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Delete User
router.delete('/:uid', async (req, res) => {
    try {
        const { uid } = req.params;
        await admin.auth().deleteUser(uid);

        console.log(`✅ [FIREBASE-USERS] Deleted user: ${uid}`);

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('❌ [FIREBASE-USERS] Error deleting user:', error.message);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// Reset Password (Send link)
router.post('/:uid/reset-password', async (req, res) => {
    try {
        const { uid } = req.params;
        const user = await admin.auth().getUser(uid);

        if (!user.email) {
            return res.status(400).json({
                success: false,
                error: 'User has no email address'
            });
        }

        // Generate the reset link
        const resetLink = await admin.auth().generatePasswordResetLink(user.email);

        res.json({
            success: true,
            message: `Password reset link generated for ${user.email}`,
            resetLink,
            email: user.email
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to generate reset link: ' + error.message
        });
    }
});

module.exports = router;
