require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const compression = require("compression");
require('./config/firebase-admin');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

const corsOptions = {
  origin: [
    "http://localhost:5000",
    
    "http://localhost:5500",
    "http://localhost:5501",
    "http://localhost:5502",
    "http://localhost:8001",
    "http://localhost:8002",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:5500",
    "http://127.0.0.1:5501",
    "http://127.0.0.1:5502",
    "http://127.0.0.1:8001",
    "http://127.0.0.1:8002",
    "http://teaching.yourdomain.com",
    "http://staff.yourdomain.com",
    "https://teaching.yourdomain.com",
    "https://staff.yourdomain.com",
    "https://availably-nonmathematical-don.ngrok-free.dev"
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Cache-Control",
    "Pragma",
    "Expires",
    "Accept",
    "X-Requested-With"
  ],
  exposedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false
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