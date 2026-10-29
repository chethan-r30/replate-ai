// Shared bounded binary assets. Proof bytes are never public.
import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    kind: { type: String, enum: ['photo', 'proof'], required: true },
    bytes: { type: Buffer, required: true, select: false },
    size: { type: Number, required: true },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export const ProofUpload = mongoose.model('ProofUpload', schema);
export const uploadBudget = new mongoose.Schema({
  _id: String,
  used: { type: Number, default: 0 },
  count: { type: Number, default: 0 },
});
export const UploadBudget = mongoose.model('UploadBudget', uploadBudget);
