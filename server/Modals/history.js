import mongoose from "mongoose";
const historyschema = mongoose.Schema(
  {
    viewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    videoid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
    },
    // Watch progress fields (added for custom video player)
    currentPosition: { type: Number, default: 0 },   // seconds
    duration:        { type: Number, default: 0 },   // total video seconds
    percentage:      { type: Number, default: 0 },   // 0-100
    completed:       { type: Boolean, default: false },
    lastWatchedAt:   { type: Date, default: Date.now },
    likedon:         { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("history", historyschema);
