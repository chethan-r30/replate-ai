// A participant may leave one rating per completed handover.
import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    claim: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim' },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
  },
  { timestamps: true },
);
schema.index({ claim: 1, from: 1 }, { unique: true });
export const Feedback = mongoose.model('Feedback', schema);
