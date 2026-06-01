const express = require('express');
const router = express.Router();
const axios = require('axios');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// IMPORTANT: In production, store this in your .env file
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || "AIzaSyDmvzNuE-szbAkFjeEjCNFJK-65sC0_IfE";

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user with email and password via Firebase REST API
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        console.log(`📡 [AUTH] Attempting login for: ${email}`);

        // 1. Call Firebase Identity Toolkit REST API to verify email/password
        const firebaseResponse = await axios.post(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
            {
                email,
                password,
                returnSecureToken: true
            }
        );

        const { idToken, localId, refreshToken, expiresIn } = firebaseResponse.data;

        // 2. Verified! Now get or sync the user profile from our MongoDB
        // Use mongoose to get the Teacher model (already registered in teacherRoutes.js)
        const Teacher = mongoose.models.Teacher;

        let userProfile = null;
        if (Teacher) {
            userProfile = await Teacher.findOne({
                $or: [
                    { email: email.toLowerCase() },
                    { firebaseUid: localId }
                ]
            });
        }

        console.log(`✅ [AUTH] Login successful for: ${email}`);

        res.json({
            success: true,
            message: "Login successful",
            token: idToken,
            refreshToken,
            expiresIn,
            user: {
                uid: localId,
                email: email,
                name: userProfile ? userProfile.name : email.split('@')[0],
                profileImageUrl: userProfile ? userProfile.profileImageUrl : '',
                staffType: userProfile ? 'teaching' : 'unknown'
            }
        });

    } catch (error) {
        console.error('❌ [AUTH] Login failed:', error.response ? error.response.data : error.message);

        const errorMessage = error.response && error.response.data && error.response.data.error
            ? error.response.data.error.message
            : 'Authentication failed';

        // Map Firebase error codes to user-friendly messages
        const errorMap = {
            'EMAIL_NOT_FOUND': 'No account found with this email.',
            'INVALID_PASSWORD': 'The password you entered is incorrect.',
            'USER_DISABLED': 'This account has been disabled.',
            'INVALID_LOGIN_CREDENTIALS': 'Invalid email or password.'
        };

        res.status(401).json({
            success: false,
            error: errorMap[errorMessage] || 'Invalid email or password'
        });
    }
});

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh parent portal access token using httpOnly refresh token cookie
 */
router.post('/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies.parentRefreshToken;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token missing. Please log in again.'
            });
        }

        const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'smart_parent_portal_jwt_refresh_secret_key_987';
        
        // Verify the refresh token
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        } catch (err) {
            console.error('❌ [AUTH] Refresh token verification failed:', err.message);
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired refresh token. Please log in again.'
            });
        }

        const studentID = decoded.studentID;
        const db = req.app.locals.db || req.app.get('db');
        if (!db) {
            return res.status(503).json({ success: false, error: 'Database unavailable' });
        }

        // Verify the student still exists and is active
        const student = await db.collection('students').findOne({ studentID: { $regex: new RegExp(`^${studentID}$`, 'i') }, isActive: true });
        if (!student) {
            return res.status(401).json({
                success: false,
                error: 'Account not found or inactive. Please log in again.'
            });
        }

        // Issue a new short-lived access token
        const JWT_SECRET = process.env.JWT_SECRET || 'fallback_parent_secret_key_123';
        const token = jwt.sign({ studentID: student.studentID }, JWT_SECRET, { expiresIn: '15m' });

        console.log(`🔄 [AUTH] Refreshed access token successfully for: ${student.studentID}`);

        res.json({
            success: true,
            token
        });

    } catch (error) {
        console.error('❌ [AUTH] Token refresh error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error during token refresh'
        });
    }
});

module.exports = router;
