import "./loadenv.js"; // MUST be first — loads .env before any other module reads process.env
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { createServer } from "http";

import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.js";
import videoRoutes from "./routes/video.js";
import commentRoutes from "./routes/comment.js";
import historyRoutes from "./routes/history.js";
import likeRoutes from "./routes/like.js";
import watchlaterRoutes from "./routes/watchlater.js";
import meetingRoutes from "./routes/meeting.js";
import downloadRoutes from "./routes/download.js";
import subscriptionRoutes from "./routes/subscription.js";

import { syncUploadsFolder } from "./controllers/video.js";
import { initSocketServer } from "./socket.js";

// dotenv already loaded via loadenv.js (first import)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsPath = path.join(__dirname, "uploads");

const app = express();
const httpServer = createServer(app);

// Init Socket.IO on the same HTTP server
initSocketServer(httpServer);

// Middleware & CORS for Vercel -> Render cross-origin communication
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Range", "X-Requested-With", "x-user-id", "x-device-id"],
  exposedHeaders: ["Content-Range", "Accept-Ranges", "Content-Length", "Content-Disposition", "X-Download-Id", "X-Remaining-Downloads", "X-Subscription-Plan", "X-Device-Id"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static uploads folder with explicit video streaming headers & CORS
app.use("/uploads", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type, x-user-id");
  res.setHeader("Accept-Ranges", "bytes");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
}, express.static(uploadsPath));

// Routes
app.use("/auth", authRoutes);
app.use("/video", videoRoutes);
app.use("/comment", commentRoutes);
app.use("/history", historyRoutes);
app.use("/like", likeRoutes);
app.use("/watchlater", watchlaterRoutes);
app.use("/meeting", meetingRoutes);
app.use("/download", downloadRoutes);
app.use("/subscription", subscriptionRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("YouTube Backend API is running");
});

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(async () => {
      console.log("MongoDB connected successfully");
      await syncUploadsFolder();
    })
    .catch((error) => {
      console.error("MongoDB connection failed:", error);
    });
}