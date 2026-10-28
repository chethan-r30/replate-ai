// Listings keep food-safety deadlines and reservation state in one indexed record.
import mongoose from 'mongoose';
const point = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number],
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    title: { type: String, required: true },
    description: String,
    category: {
      type: String,
      enum: ['cooked', 'bakery', 'produce', 'packaged', 'dairy'],
      required: true,
    },
    dietary: [String],
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    servings: { type: Number, required: true },
    photos: [String],
    preparedAt: Date,
    bestBefore: { type: Date, required: true },
    pickupWindow: { start: Date, end: Date },
    location: { type: point, required: true },
    status: {
      type: String,
      enum: ['available', 'reserved', 'picked_up', 'expired', 'cancelled'],
      default: 'available',
    },
    reservedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    activeClaim: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim' },
    aiMeta: { items: [String], safetyNotes: [String] },
    notifiedOrgs: [mongoose.Schema.Types.ObjectId],
    lastNotifiedAt: Date,
    expiryReminderAt: Date,
  },
  { timestamps: true },
);
schema.index({ location: '2dsphere' });
schema.index({ status: 1, bestBefore: 1 });
schema.index({ restaurant: 1, createdAt: -1 });
export const FoodListing = mongoose.model('FoodListing', schema);
