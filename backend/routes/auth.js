
const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  
  // MLA Academy credentials - YOURS + defaults
  const users = {
    'skandaumesh82@gmail.com': { role: 'teaching', name: 'Skanda Umesh' },
    'teacher@mla.com': { role: 'teaching', name: 'Teaching Staff' },
    'admin@mla.com': { role: 'non-teaching', name: 'Admin Staff' }
  };

  // Check credentials
  if (users[email] && (password === 'skandaumesh123' || password === 'mla123')) {
    return res.json({
      success: true,
      token: 'jwt.mock.' + Date.now(),
      user: {
        email,
        role: users[email].role,
        name: users[email].name,
        permissions: ['attendance', 'students', 'reports']
      }
    });
  }

  res.status(401).json({ success: false, error: 'Invalid credentials' });
});

module.exports = router;
