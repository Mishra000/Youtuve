import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true, index: true },
  hostId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  hostName: { type: String, required: true },
  coHosts: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
  participants: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
      name: String,
      joinedAt: { type: Date, default: Date.now },
    },
  ],
  isLocked: { type: Boolean, default: false },
  maxParticipants: {
    type: Number,
    default: parseInt(process.env.MAX_MEETING_PARTICIPANTS || "50"),
  },
  chatEnabled: { type: Boolean, default: true },
  screenShareEnabled: { type: Boolean, default: true },
  status: {
    type: String,
    enum: ["active", "ended"],
    default: "active",
  },
  createdAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
});

export default mongoose.model("Meeting", meetingSchema);
