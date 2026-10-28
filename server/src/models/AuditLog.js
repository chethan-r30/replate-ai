// Record admin decisions without copying private documents or auth tokens.
import mongoose from 'mongoose';
export const AuditLog = mongoose.model(
  'AuditLog',
  new mongoose.Schema(
    {
      actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      action: String,
      target: String,
      reason: String,
    },
    { timestamps: true },
  ),
);
