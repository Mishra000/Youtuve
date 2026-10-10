import mongoose from "mongoose";

// ─── Main Comment Model ──────────────────────────────────────────────────────
// EXTENDED from the original (userid, videoid, commentbody, usercommented, commentedon)
// All original fields preserved for backward compatibility.

const commentschema = mongoose.Schema(
  {
    // ── Original fields (unchanged) ──
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    videoid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "videofiles",
      required: true,
    },
    commentbody: { type: String, default: "" },
    usercommented: { type: String },
    commentedon: { type: Date, default: Date.now },

    // ── New fields ──
    parentCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "comment",
      default: null,
    },
    likes:    { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 },
    replyCount: { type: Number, default: 0 },

    // Soft delete
    deleted:        { type: Boolean, default: false },
    isDeleted:      { type: Boolean, default: false },
    deletedAt:      { type: Date,    default: null },
    deletedBy:      { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null },
    deletedReason:  { type: String,  default: null },

    // Edit tracking
    edited:    { type: Boolean, default: false },
    editedAt:  { type: Date,    default: null },
    version:   { type: Number,  default: 0 },      // optimistic concurrency
    editHistory: [
      {
        previousText: { type: String },
        newText:      { type: String },
        text:         { type: String },
        editedAt:     { type: Date },
        editedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "user" },
      },
    ],

    // Moderation
    moderationStatus: {
      type: String,
      enum: ["OK", "VISIBLE", "PENDING", "FLAGGED", "HIDDEN", "REVIEWED", "ACTION_TAKEN", "DISMISSED"],
      default: "VISIBLE",
    },
    flaggedSpam:     { type: Boolean, default: false },
    flaggedProfanity:{ type: Boolean, default: false },
    spamScore:       { type: Number,  default: 0 },
    reportCount:     { type: Number,  default: 0 },

    // Multilingual & Translation fields
    originalText:     { type: String, default: "" },
    originalLanguage: { type: String, default: "en" },
    languageCode:     { type: String, default: "en" },
    languageName:     { type: String, default: "English" },
    language:         { type: String, default: "en" },
    translations:     { type: Map, of: String, default: {} },

    // Mentions & User metadata
    mentions:     [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    userLocation: { type: String, default: "" },
  },
  { timestamps: true }
);

// Indexes for performance
commentschema.index({ videoid: 1, createdAt: -1 });
commentschema.index({ videoid: 1, likes: -1 });
commentschema.index({ parentCommentId: 1, createdAt: 1 });
commentschema.index({ userid: 1 });
commentschema.index({ moderationStatus: 1, reportCount: -1 });

export default mongoose.model("comment", commentschema);

// ─── Comment Reaction ────────────────────────────────────────────────────────
const reactionSchema = mongoose.Schema(
  {
    commentId: { type: mongoose.Schema.Types.ObjectId, ref: "comment", required: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: "user",    required: true },
    reaction:  { type: String, enum: ["LIKE", "DISLIKE"], required: true },
  },
  { timestamps: true }
);
reactionSchema.index({ commentId: 1, userId: 1 }, { unique: true });
export const CommentReaction = mongoose.model("CommentReaction", reactionSchema);

// ─── Comment Report ──────────────────────────────────────────────────────────
const reportSchema = mongoose.Schema(
  {
    commentId: { type: mongoose.Schema.Types.ObjectId, ref: "comment", required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user",   required: true },
    reason: {
      type: String,
      enum: ["SPAM", "HARASSMENT", "OFFENSIVE", "HATE_ABUSE", "MALICIOUS_LINK", "OTHER"],
      required: true,
    },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["PENDING", "REVIEWED", "ACTION_TAKEN", "DISMISSED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);
reportSchema.index({ commentId: 1, reportedBy: 1 }, { unique: true });
export const CommentReport = mongoose.model("CommentReport", reportSchema);

// ─── Moderation Log ──────────────────────────────────────────────────────────
const modLogSchema = mongoose.Schema(
  {
    commentId:      { type: mongoose.Schema.Types.ObjectId, ref: "comment", required: true },
    adminId:        { type: mongoose.Schema.Types.ObjectId, ref: "user" },
    action:         { type: String, required: true }, // DELETE, RESTORE, DISMISS_REPORT, etc.
    reason:         { type: String, default: "" },
    previousStatus: { type: String, default: "" },
    newStatus:      { type: String, default: "" },
    meta:           { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);
modLogSchema.index({ commentId: 1 });
modLogSchema.index({ adminId: 1 });
export const CommentModerationLog = mongoose.model("CommentModerationLog", modLogSchema);

// ─── Translation Cache ───────────────────────────────────────────────────────
const translationSchema = mongoose.Schema(
  {
    commentId:  { type: mongoose.Schema.Types.ObjectId, ref: "comment", required: true },
    targetLang: { type: String, required: true },
    translated: { type: String, required: true },
  },
  { timestamps: true }
);
translationSchema.index({ commentId: 1, targetLang: 1 }, { unique: true });
export const CommentTranslation = mongoose.model("CommentTranslation", translationSchema);

// ─── Comment History Model ───────────────────────────────────────────────────
const historySchema = mongoose.Schema(
  {
    commentId:    { type: mongoose.Schema.Types.ObjectId, ref: "comment", required: true },
    userId:       { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    previousText: { type: String, required: true },
    newText:      { type: String, required: true },
    editedAt:     { type: Date, default: Date.now },
  },
  { timestamps: true }
);
historySchema.index({ commentId: 1, editedAt: -1 });
export const CommentHistory = mongoose.model("CommentHistory", historySchema);

