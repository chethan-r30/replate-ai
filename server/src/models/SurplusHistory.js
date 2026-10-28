// Historical numeric measurements support pure forecasting without an AI key.
import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodListing',
      unique: true,
      sparse: true,
    },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization' },
    date: Date,
    dayOfWeek: Number,
    category: String,
    quantityPosted: Number,
    quantityClaimed: Number,
    weather: String,
    eventFlag: Boolean,
  },
  { timestamps: true },
);
schema.index({ restaurant: 1, category: 1, date: -1 });
export const SurplusHistory = mongoose.model('SurplusHistory', schema);
