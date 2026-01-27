const express = require('express');
const router = express.Router();
const { validateLogin } = require('../middleware/validation');
const admin = require('firebase-admin');

// Mock login for testing (replace with Firebase Auth later)
router.post('/login', validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Mock teacher credentials for MLA Academy
    const teachers = {
      'teacher@mla.com': { role: 'teaching', name: 'Teaching Staff' },
      'admin@mla.com': { role: 'non-teaching', name: 'Admin Staff' }
    };

    if (teachers[email] && password === 'mla123') {
      return res.json({
        success: true,
        token: 'jwt.mock.token.' + Date.now(),
        user: {
          email,
          role: teachers[email].role,
          name: teachers[email].name,
          permissions: ['attendance', 'students', 'reports']
        }
      });
    }

    res.status(401).json({ success: false, error: 'Invalid credentials' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

module.exports = router;
