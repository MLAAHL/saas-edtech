// middleware/firebaseAuth.js
const admin = require('../config/firebase-admin'); // ✅ Import from initialized instance

const firebaseAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  // Check if authorization header exists and has Bearer token
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      error: 'Missing or invalid authorization header' 
    });
  }

  const token = authHeader.split('Bearer ')[1];
  
  // Validate token format
  if (!token || token.trim() === '') {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid token format' 
    });
  }

  try {
    // Verify the Firebase ID token
    const decoded = await admin.auth().verifyIdToken(token);
    
    // Attach user info to request object
    req.firebaseUser = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.email?.split('@')[0]
    };
    
    console.log('✅ Token verified for user:', decoded.email);
    next();
  } catch (err) {
    console.error('❌ Firebase token verification failed:', err.message);
    
    // Handle specific error cases
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({ 
        success: false, 
        error: 'Token expired. Please log in again.' 
      });
    }
    
    if (err.code === 'auth/argument-error') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token format' 
      });
    }
    
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Invalid token' 
    });
  }
};

module.exports = firebaseAuth;
