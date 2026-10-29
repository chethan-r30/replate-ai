// Origin URLs never leave the server. Only the owner or an admin can read bytes.
import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    publicId: { type: String, required: true },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export const ProofUpload = mongoose.model('ProofUpload', schema);
