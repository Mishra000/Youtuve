import video from "../Modals/video.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const syncUploadsFolder = async () => {
  try {
    const uploadsDir = path.resolve(__dirname, "..", "uploads");
    if (!fs.existsSync(uploadsDir)) return;

    const files = fs.readdirSync(uploadsDir);
    for (const filename of files) {
      if (
        filename.endsWith(".mp4") ||
        filename.endsWith(".webm") ||
        filename.endsWith(".mov") ||
        filename.endsWith(".mkv")
      ) {
        const normalizedPath = `uploads/${filename}`;
        const existing = await video.findOne({
          $or: [
            { filename: filename },
            { filepath: normalizedPath },
            { filepath: `uploads\\${filename}` },
          ],
        });

        if (!existing) {
          const stats = fs.statSync(path.join(uploadsDir, filename));
          const displayTitle = filename
            .replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-/, "")
            .replace(/[-_]/g, " ")
            .replace(/\.[^/.]+$/, "");

          const newVid = new video({
            videotitle: displayTitle || "YourTube Video",
            filename: filename,
            filepath: normalizedPath,
            filetype: "video/mp4",
            filesize: String(stats.size),
            videochanel: "YourTube Channel",
            uploader: "system",
            views: 250,
            Like: 35,
          });
          await newVid.save();
          console.log(`Successfully synced existing MP4 file to MongoDB: ${filename}`);
        }
      }
    }
  } catch (error) {
    console.error("Error syncing uploads folder:", error);
  }
};

export const uploadvideo = async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ message: "Please upload a valid video file" });
  } else {
    try {
      const normalizedPath = req.file.path.replace(/\\/g, "/");
      const file = new video({
        videotitle: req.body.videotitle || req.file.originalname,
        filename: req.file.filename || req.file.originalname,
        filepath: normalizedPath,
        filetype: req.file.mimetype,
        filesize: String(req.file.size),
        videochanel: req.body.videochanel || "Default Channel",
        uploader: req.body.uploader || "Anonymous",
      });
      await file.save();
      return res.status(201).json({ message: "file uploaded successfully", video: file });
    } catch (error) {
      console.error("Upload error:", error);
      return res.status(500).json({ message: "Something went wrong" });
    }
  }
};

export const getallvideo = async (req, res) => {
  try {
    await syncUploadsFolder();
    const files = await video.find();
    return res.status(200).json(files || []);
  } catch (error) {
    console.error("Fetch videos error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getPremiumVideo = async (req, res) => {
  const { videoId } = req.params;
  try {
    const vid = await video.findById(videoId);
    if (!vid) {
      return res.status(404).json({ success: false, message: "Video not found" });
    }
    return res.status(200).json({
      success: true,
      message: "Premium content authorized",
      video: vid,
      userPlan: req.user?.subscription?.plan || "BRONZE",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
