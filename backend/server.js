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
// ENVIRONMENT VALIDATION
// ============================================================================
if (!MONGODB_URI || !PORT || !process.env.FIREBASE_PROJECT_ID || !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_UPLOAD_PRESET) {
  console.error("❌ Missing required environment variables. Check .env file.");
  process.exit(1);
}

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: isProduction
      ? {
          useDefaults: true,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://trustedscripts.example.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https://trustedimages.example.com"],
            connectSrc: ["'self'", "https://mlaahl.online", "https://admin.mlaahl.online"],
            objectSrc: ["'none'"],
          },
        }
      : false, // Disable CSP enforcement during development
  })
);

// Rate limiting to prevent abuse
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute window
  max: isProduction ? 100 : 2000, // Allow more requests in Dev mode
  message: "Too many requests. Please try again later.",
});
app.use("/api", generalLimiter);

// ============================================================================
// CORS CONFIGURATION
// ============================================================================
const allowedOrigins = [
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "https://mlaahl.online", // Teaching frontend URL
  "https://admin.mlaahl.online", // Admin frontend URL
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
  credentials: true, // Allow cookies and credentials
};
app.use(cors(corsOptions));

// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ============================================================================
// MONGODB CONNECTION - Enhanced Setup
// ============================================================================
mongoose
  .connect(MONGODB_URI, { maxPoolSize: 20, serverSelectionTimeoutMS: 10000 })
  .then(() => console.log("✅ MongoDB connected successfully"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message || err);
    process.exit(1); // Exit application if database fails
  });

// ============================================================================
// REGISTER API ROUTES
// ============================================================================
const teacherRoutes = require("./routes/teacherRoutes");
app.use("/api/teacher", teacherRoutes); // Ensure the teacher routes are properly imported
// Add your other route imports here...

// ============================================================================
// ERROR HANDLING MIDDLEWARE
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
  console.error("❌ Server error:", err.message || err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error",
    stack: !isProduction ? err.stack : undefined, // Expose stack only in development mode
  });
});

// ============================================================================
// START SERVER
// ============================================================================
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(70));
  console.log("🚀 SMART ATTENDANCE LMS - BACKEND SERVER");
  console.log("=".repeat(70));
  console.log(`📡 Server running at: http://localhost:${PORT}`);
  console.log(`🏥 Health Check endpoint: http://localhost:${PORT}/health`);
});
