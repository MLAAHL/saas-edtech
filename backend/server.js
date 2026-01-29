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
      : false,
  })
);

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 100 : 2000, // Dev limit higher
  message: "Too many requests. Please try again later.",
});
app.use("/api", generalLimiter);

// ============================================================================
// CORS CONFIGURATION
// ============================================================================
const allowedOrigins = [
  "http://localhost:5000",
  "https://mlaahl.online",
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
  .connect(MONGODB_URI, { maxPoolSize: 20, serverSelectionTimeoutMS: 10000 })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ============================================================================
// REGISTER API ROUTES
// ============================================================================
const teacherRoutes = require("./routes/teacherRoutes");
app.use("/api/teacher", teacherRoutes);
// Add other routes...

// ============================================================================
// ERROR HANDLERS
// ============================================================================
app.use("/api/*", (req, res) => {
  res.status(404).json({ success: false, error: "API endpoint not found" });
});

app.use((err, req, res, next) => {
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
});
