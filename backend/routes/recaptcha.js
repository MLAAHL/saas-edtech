// routes/recaptcha.js
// Backend verification for reCAPTCHA tokens (optional but recommended)

const express = require('express');
const router = express.Router();

const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;

/**
 * Verify reCAPTCHA token
 * POST /api/verify-recaptcha
 * Body: { token: string }
 */
router.post('/verify-recaptcha', async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'reCAPTCHA token is required'
            });
        }

        if (!RECAPTCHA_SECRET_KEY) {
            console.warn('⚠️ RECAPTCHA_SECRET_KEY not set - skipping verification');
            return res.json({ success: true, score: 1.0, skipped: true });
        }

        // Verify with Google
        const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
        const response = await fetch(verifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${RECAPTCHA_SECRET_KEY}&response=${token}`
        });

        const data = await response.json();

        console.log('🔐 reCAPTCHA verification:', {
            success: data.success,
            score: data.score,
            action: data.action
        });

        if (!data.success) {
            return res.status(400).json({
                success: false,
                error: 'reCAPTCHA verification failed',
                errorCodes: data['error-codes']
            });
        }

        // Check score (0.0 = bot, 1.0 = human)
        // Recommended threshold: 0.5
        const threshold = 0.5;
        if (data.score < threshold) {
            console.warn(`⚠️ Low reCAPTCHA score: ${data.score}`);
            return res.status(400).json({
                success: false,
                error: 'Security check failed. Please try again.',
                score: data.score
            });
        }

        res.json({
            success: true,
            score: data.score,
            action: data.action
        });

    } catch (error) {
        console.error('❌ reCAPTCHA verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Verification failed'
        });
    }
});

module.exports = router;
