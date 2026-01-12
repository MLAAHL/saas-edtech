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
// ✅ CORS - PERFECT FOR SEPARATE FRONTEND
// ============================================================================

const corsOptions = {
  origin: [
    "https://saas-edtech.onrender.com",           // Backend itself
    "http://localhost:3000", "http://localhost:5500", "http://localhost:5501",
    "http://localhost:5502", "http://localhost:8001", "http://localhost:8002",
    "http://127.0.0.1:3000", "http://127.0.0.1:5500", "http://127.0.0.1:5501", 
    "http://127.0.0.1:5502", "http://127.0.0.1:8001", "http://127.0.0.1:8002",
    // ✅ YOUR FRONTEND DOMAINS (add when deployed)
    "https://your-frontend.onrender.com",
    "https://non-teaching.yourdomain.com",
    "https://dataentrymla.netlify.app",
    "http://teaching.yourdomain.com", "http://staff.yourdomain.com",
    "https://teaching.yourdomain.com", "https://staff.yourdomain.com",
    "https://availably-nonmathematical-don.ngrok-free.dev",
    /^https?:\/\/.*\.ngrok-free\.(app|dev|io)$/,
    /^https?:\/\/.*\.onrender\.com$/,  // All Render apps
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type", "Authorization", "Cache-Control", "Pragma", 
    "Expires", "Accept", "X-Requested-With"
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ============================================================================
// RENDER PRODUCTION MIDDLEWARE
// ============================================================================

app.set('trust proxy', 1);  // Essential for Render
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ============================================================================
// MONGODB + MIDDLEWARE (unchanged)
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

app.use((req, res, next) => {
  if (!req.app.locals.db && mongoose.connection.db) {
    req.app.locals.db = mongoose.connection.db;
  }
  req.db = req.app.locals.db;
  next();
});

app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} | Origin: ${req.get('origin') || 'direct'}`);
  next();
});

// ============================================================================
// API DOCUMENTATION LANDING PAGE
// ============================================================================

app.get('/', (req, res) => {
  res.json({
    message: "🚀 Smart Attendance LMS API - LIVE ON RENDER",
    apiBase: "https://saas-edtech.onrender.com/api",
    frontendApi: "https://saas-edtech.onrender.com/api", 
    documentation: {
      health: "/api/health",
      students: "/api/students",
      dashboard: "/api/dashboard/stats",
      config: "/api/config/app"
    },
    status: "production-ready"
  });
});

// ============================================================================
// YOUR EXISTING ENDPOINTS (ENHANCED)
// ============================================================================

app.get("/api/config/cloudinary", (req, res) => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    return res.status(500).json({ success: false, error: 'Cloudinary configuration not available' });
  }
  res.json({ success: true, config: { cloudName, uploadPreset } });
});

app.get("/api/config/app", (req, res) => {
  res.json({
    success: true,
    config: {
      appName: 'Smart Attendance',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'production',
      apiBase: 'https://saas-edtech.onrender.com/api',  // ✅ For your frontend
      features: {
        cloudinaryEnabled: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_UPLOAD_PRESET),
        aiAssistantEnabled: !!process.env.GEMINI_API_KEY,
        whatsappEnabled: !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN)
      }
    }
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK - PRODUCTION",
    url: "https://saas-edtech.onrender.com",
    frontendApiBase: "https://saas-edtech.onrender.com/api",
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend LIVE on Render ✅",
    apiUrl: "https://saas-edtech.onrender.com/api",
    frontendConfig: "Use apiBase: 'https://saas-edtech.onrender.com/api'",
    timestamp: new Date().toISOString(),
    database: req.db ? "Connected" : "Disconnected"
  });
});

// Load your routes (unchanged)
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

app.use("/api/dashboard", dashboardRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/ai-assistant", aiAssistantRouter);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api", promotionRoutes);
app.use("/api", attendanceRoutes);
app.use("/api", absenceNotificationRoutes);
app.use("/api", viewAttendanceRoutes);

// Error handlers (unchanged)
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
    baseUrl: 'https://saas-edtech.onrender.com/api'
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Render production server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('\n🚀 SMART ATTENDANCE API - RENDER LIVE');
  console.log('='.repeat(60));
  console.log('🌐 API: https://saas-edtech.onrender.com/api');
  console.log('📱 Frontend uses: https://saas-edtech.onrender.com/api');
  console.log('✅ CORS allows all localhost + Render + ngrok');
  console.log('='.repeat(60));
});

// Graceful shutdown (unchanged)
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await mongoose.connection.close();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 SIGTERM received...');
  await mongoose.connection.close();
  server.close(() => process.exit(0));
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

