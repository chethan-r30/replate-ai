// Active claims are coupled to the listing with an atomic reservation compare/swap.
import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodListing',
      required: true,
      index: true,
    },
    ngo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        'requested',
        'approved',
        'rejected',
        'picked_up',
        'cancelled',
        'no_show',
      ],
      default: 'requested',
    },
    pickupCode: { type: String, select: false },
    assignedVolunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: String,
    pickedUpAt: Date,
  },
  { timestamps: true },
);
export const Claim = mongoose.model('Claim', schema);
