const express = require('express');
const router = express.Router();
const axios = require('axios');
const mongoose = require('mongoose');

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

module.exports = router;
