require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("./config/firebase-admin");

const app = express();
app.set("trust proxy", 1); // Trust proxy for rate limiting
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const isProduction = process.env.NODE_ENV === "production";

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Helmet - Security Headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    contentSecurityPolicy: isProduction
      ? {
          useDefaults: true,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://trustedscripts.example.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https://trustedimages.example.com"],
            connectSrc: [
              "'self'",
              "https://mlaahl.online",
              "https://admin.mlaahl.online",
            ],
            objectSrc: ["'none'"],
          },
        }
      : false, // Disable CSP in development
  })
);

// Apply rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 100 : 1000, // Stricter limits in production
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests. Please try again later.",
});
app.use("/api", generalLimiter);

// ============================================================================
// CORS CONFIGURATION
// ============================================================================

const allowedOrigins = [
  "http://localhost:5000",
  "http://localhost:5500",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:5500",
  "https://mlaahl.online", // Teaching frontend
  "https://admin.mlaahl.online", // Admin frontend
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : []),
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS blocked origin: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Cache-Control",
    "Pragma",
    "Expires",
    "Accept",
    "X-Requested-With",
  ],
  exposedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// ============================================================================
// OTHER MIDDLEWARE
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
  })
  .then(() => {
    console.log("✅ MongoDB connected");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ============================================================================
// REQUEST LOGGER
// ============================================================================
app.use((req, res, next) => {
  if (!isProduction) {
    console.log(`📥 ${req.method} ${req.path}`);
  }
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

// ============================================================================
// REGISTER API ROUTES
// ============================================================================
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/ai-assistant", aiAssistantRouter);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/auth", authRoutes);
app.use("/api", promotionRoutes);
app.use("/api", attendanceRoutes);
app.use("/api", absenceNotificationRoutes);
app.use("/api", viewAttendanceRoutes);

// ============================================================================
// STANDALONE ENDPOINTS
// ============================================================================
app.get("/api/config/cloudinary", (req, res) => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    return res
      .status(500)
      .json({ success: false, error: "Cloudinary config missing" });
  }
  res.json({
    success: true,
    config: { cloudName: CLOUDINARY_CLOUD_NAME, uploadPreset: CLOUDINARY_UPLOAD_PRESET },
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// ERROR HANDLERS
// ============================================================================

app.use("/api/*", (req, res) => {
  if (!isProduction) {
    console.warn("⚠️ 404 - API endpoint not found:", req.originalUrl);
  }
  res.status(404).json({
    success: false,
    error: "API endpoint not found",
    path: req.originalUrl,
  });
});

app.use((err, req, res, next) => {
  console.error("❌ Server error:", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error",
    stack: !isProduction ? err.stack : undefined,
  });
});

// ============================================================================
// START SERVER
// ============================================================================
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(70));
  console.log("🚀 SMART ATTENDANCE LMS - BACKEND SERVER");
  console.log("=".repeat(70));
  console.log(`📡 Server:              http://localhost:${PORT}`);
  console.log(`🏥 Health Check:        http://localhost:${PORT}/health`);
});
