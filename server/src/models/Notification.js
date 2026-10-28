// Notifications are persisted before live delivery so offline users do not miss them.
import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    type: String,
    message: String,
    readAt: Date,
  },
  { timestamps: true },
);
schema.index({ user: 1, createdAt: -1 });
export const Notification = mongoose.model('Notification', schema);
