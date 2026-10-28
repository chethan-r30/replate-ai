// Single-use verification/reset tokens are hashed and atomically consumed.
import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    type: { type: String, enum: ['verify', 'reset'], required: true },
    expiresAt: { type: Date, index: { expires: 0 } },
    usedAt: Date,
  },
  { timestamps: true },
);
export const ActionToken = mongoose.model('ActionToken', schema);
