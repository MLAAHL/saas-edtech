// middleware/parentAuth.js
const jwt = require('jsonwebtoken');

const parentAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split('Bearer ')[1];
  if (!token) {
    return res.status(401).json({ success: false, error: 'Invalid token format' });
  }

  try {
    const JWT_SECRET = process.env.JWT_SECRET || 'fallback_parent_secret_key_123';
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch student from DB to check jwtVersion
    const db = req.app.locals.db || req.app.get('db');
    if (!db) return res.status(503).json({ success: false, error: 'Database unavailable' });
    const student = await db.collection('students').findOne({ studentID: { $regex: new RegExp(`^${decoded.studentID}$`, 'i') } });
    
    if (!student) {
      return res.status(401).json({ success: false, error: 'Student account not found' });
    }

    const currentVersion = student.jwtVersion || 1;
    const tokenVersion = decoded.jwtVersion || 1;
    
    if (tokenVersion !== currentVersion) {
        return res.status(401).json({ 
            error: 'SESSION_INVALIDATED',
            message: 'Your password was reset. Please sign in again.'
        });
    }

    // Attach studentID to request
    req.parentSession = {
      studentID: decoded.studentID
    };

    // Ensure they only access their own student's data if studentID is in params
    if (req.params.studentID && req.params.studentID.toLowerCase() !== decoded.studentID.toLowerCase()) {
      return res.status(403).json({ success: false, error: 'Access denied to this student record' });
    }

    next();
  } catch (err) {
    console.error('❌ Parent token verification failed:', err.message);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
};

module.exports = parentAuth;
