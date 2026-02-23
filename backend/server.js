require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require('./config/firebase-admin');

const app = express();
app.set("trust proxy", 1); // Trust Render's proxy for rate limiting
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const isProduction = process.env.NODE_ENV === 'production';

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Helmet - Security Headers (XSS, Clickjacking, MIME sniffing protection)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

// Rate Limiting - Prevent DoS attacks
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 500 : 1000, // 500 requests per 15 min in production
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limit for sensitive operations
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isProduction ? 20 : 100, // 20 requests per hour for sensitive ops
  message: {
    success: false,
    error: 'Rate limit exceeded for this operation.',
    retryAfter: '1 hour'
  }
});

// AI/Chatbot specific limiter (Gemini API costs money)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: isProduction ? 10 : 50, // 10 requests per minute
  message: {
    success: false,
    error: 'AI rate limit exceeded. Please wait.',
    retryAfter: '1 minute'
  }
});

app.use('/api/', generalLimiter);
app.use('/api/chatbot', aiLimiter);
app.use('/api/ai-assistant', aiLimiter);
app.use('/api/students/bulk/delete', strictLimiter);
app.use('/api/promotion', strictLimiter);

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

const corsOptions = {
  origin: '*', // Allow ALL origins
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Cache-Control", "Expires", "Pragma"],
  credentials: false // Disable credentials for easier cross-origin access
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ============================================================================
// MIDDLEWARE
// ============================================================================

app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ============================================================================
// CACHING MIDDLEWARE FOR FASTER RESPONSES
// ============================================================================

// Cache control for static/semi-static API endpoints
const cacheMiddleware = (duration) => {
  return (req, res, next) => {
    res.set('Cache-Control', `public, max-age=${duration}`);
    next();
  };
};

// Apply caching to specific routes that don't change often
app.use('/api/streams', cacheMiddleware(300)); // 5 minutes
app.use('/api/config/cloudinary', cacheMiddleware(3600)); // 1 hour
app.use('/api/config/app', cacheMiddleware(3600)); // 1 hour

// ============================================================================
// MONGODB CONNECTION
// ============================================================================

mongoose
  .connect(MONGODB_URI, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 5000,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ MongoDB connected");
    app.locals.db = mongoose.connection.db;
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Database middleware
app.use((req, res, next) => {
  if (!req.app.locals.db && mongoose.connection.db) {
    req.app.locals.db = mongoose.connection.db;
  }
  req.db = req.app.locals.db;
  next();
});

// ============================================================================
// REQUEST LOGGER
// ============================================================================

app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// LOAD ROUTE MODULES
// ============================================================================

const teacherRoutes = require("./routes/teacherRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const studentsRoutes = require("./routes/students");
const dashboardRoutes = require("./routes/dashboard");
const reportsRoutes = require("./routes/reports");
const viewAttendanceRoutes = require("./routes/viewAttendanceRoutes");
const promotionRoutes = require("./routes/promotion");
const aiAssistantRouter = require("./routes/ai-assistant");
const chatbotRoutes = require("./routes/chatbot");
const absenceNotificationRoutes = require("./routes/absenceNotificationRoutes");
const authRoutes = require("./routes/auth");
const enrollmentsRoutes = require("./routes/enrollments");
const notificationsRoutes = require("./routes/notifications");
const firebaseUsersRoutes = require("./routes/firebaseUsers");
const mentorshipRoutes = require("./routes/mentorship");

// ============================================================================
// STANDALONE API ENDPOINTS
// ============================================================================

// Cloudinary config
app.get("/api/config/cloudinary", (req, res) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    return res.status(500).json({
      success: false,
      error: 'Cloudinary configuration not available'
    });
  }

  res.json({
    success: true,
    config: { cloudName, uploadPreset }
  });
});

// App config
app.get("/api/config/app", (req, res) => {
  res.json({
    success: true,
    config: {
      appName: 'Smart Attendance',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      features: {
        cloudinaryEnabled: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_UPLOAD_PRESET),
        aiAssistantEnabled: !!process.env.GEMINI_API_KEY,
        whatsappEnabled: !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN)
      }
    }
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
    database: mongoose.connection.db?.databaseName,
    cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? "Configured" : "Not configured",
    whatsapp: {
      configured: !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN),
      collegeName: process.env.COLLEGE_NAME || 'MLA ACADEMY',
      collegePhone: process.env.COLLEGE_PHONE || '+91-1234567890',
      collegeEmail: process.env.COLLEGE_EMAIL || 'office@mlaacademy.edu'
    }
  });
});

// API health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
    database: req.db ? "Connected" : "Disconnected"
  });
});

// ============================================================================
// REGISTER API ROUTES (Order Matters!)
// ============================================================================

// Specific routes first
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/ai-assistant", aiAssistantRouter);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/enrollments", enrollmentsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/firebase-users", strictLimiter, firebaseUsersRoutes);
app.use("/api/mentorship", mentorshipRoutes);

// ✅ PROMOTION ROUTES - BEFORE ATTENDANCE (Critical!)
app.use("/api", promotionRoutes);

// General routes last
app.use("/api", attendanceRoutes);
app.use("/api", absenceNotificationRoutes);
app.use("/api", viewAttendanceRoutes);

// ============================================================================
// ERROR HANDLERS (Must be LAST!)
// ============================================================================

// 404 handler
app.use('/api/*', (req, res) => {
  console.log('⚠️ 404 - API endpoint not found:', req.originalUrl);
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ============================================================================
// START SERVER
// ============================================================================

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 SMART ATTENDANCE LMS - BACKEND SERVER');
  console.log('='.repeat(70));
  console.log(`📡 Server:              http://localhost:${PORT}`);
  console.log(`🏥 Health Check:        http://localhost:${PORT}/health`);
  console.log(`📊 Dashboard:           http://localhost:${PORT}/api/dashboard/stats`);
  console.log(`👥 Students:            http://localhost:${PORT}/api/students`);
  console.log(`📚 Streams:             http://localhost:${PORT}/api/streams`);
  console.log(`🎓 Promotion:           http://localhost:${PORT}/api/simple-promotion-preview/BCA`);
  console.log(`👨‍🏫 Teacher:             http://localhost:${PORT}/api/teacher`);
  console.log('='.repeat(70));
  console.log('✅ All routes registered\n');
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await mongoose.connection.close();
  console.log('✅ MongoDB closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received...');
  await mongoose.connection.close();
  console.log('✅ MongoDB closed');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
}); 