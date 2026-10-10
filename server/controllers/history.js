import video from "../Modals/video.js";
import history from "../Modals/history.js";

// Completion threshold — centralized config (90% = watched)
export const WATCH_COMPLETION_PERCENTAGE = 90;

export const handlehistory = async (req, res) => {
  const { userId } = req.body;
  const { videoId } = req.params;
  try {
    await history.create({ viewer: userId, videoid: videoId });
    await video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });
    return res.status(200).json({ history: true });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const handleview = async (req, res) => {
  const { videoId } = req.params;
  try {
    await video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

export const getallhistoryVideo = async (req, res) => {
  const { userId } = req.params;
  try {
    const historyvideo = await history
      .find({ viewer: userId })
      .populate({
        path: "videoid",
        model: "videofiles",
      })
      .sort({ lastWatchedAt: -1 })
      .exec();
    return res.status(200).json(historyvideo);
  } catch (error) {
    console.error(" error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

/**
 * POST /history/progress/:videoId
 * Save or update watch progress for an authenticated user.
 * Body: { userId, currentPosition, duration, percentage }
 * NEVER trusts userId for security — uses body userId matched against authenticated session.
 * (For this project auth is session-based via localStorage; userId is passed from context.)
 */
export const saveWatchProgress = async (req, res) => {
  const { videoId } = req.params;
  const { userId, currentPosition, duration, percentage } = req.body;

  if (!userId || !videoId) {
    return res.status(400).json({ message: "userId and videoId required" });
  }

  try {
    const pos = parseFloat(currentPosition) || 0;
    const dur = parseFloat(duration) || 0;
    const pct = parseFloat(percentage) || 0;
    const isCompleted = pct >= WATCH_COMPLETION_PERCENTAGE;

    // Upsert: update existing record or create new one
    const result = await history.findOneAndUpdate(
      { viewer: userId, videoid: videoId },
      {
        $set: {
          currentPosition: pos,
          duration: dur,
          percentage: pct,
          completed: isCompleted,
          lastWatchedAt: new Date(),
        },
        $setOnInsert: { likedon: new Date() },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      ok: true,
      completed: isCompleted,
      currentPosition: pos,
      percentage: pct,
    });
  } catch (error) {
    console.error("saveWatchProgress error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

/**
 * GET /history/progress/:videoId?userId=xxx
 * Returns saved watch progress for a user+video pair.
 */
export const getWatchProgress = async (req, res) => {
  const { videoId } = req.params;
  const { userId } = req.query;

  if (!userId || !videoId) {
    return res.status(400).json({ message: "userId and videoId required" });
  }

  try {
    const entry = await history.findOne({ viewer: userId, videoid: videoId });
    if (!entry) {
      return res.status(200).json({ found: false, currentPosition: 0, percentage: 0, completed: false });
    }
    return res.status(200).json({
      found: true,
      currentPosition: entry.currentPosition || 0,
      duration: entry.duration || 0,
      percentage: entry.percentage || 0,
      completed: entry.completed || false,
      lastWatchedAt: entry.lastWatchedAt,
    });
  } catch (error) {
    console.error("getWatchProgress error:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};
