// One organization per owner; geospatial coordinates are longitude then latitude.
import mongoose from 'mongoose';
const point = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    type: { type: String, enum: ['restaurant', 'ngo'], required: true },
    name: { type: String, required: true },
    registrationNo: { type: String, required: true },
    address: { type: String, required: true },
    location: { type: point, required: true },
    operatingHours: {
      start: { type: Number, default: 0 },
      end: { type: Number, default: 24 },
    },
    capacity: { type: Number, default: 100 },
    preferences: { categories: [String], dietary: [String] },
    verificationDocs: [String],
    verificationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    rating: { type: Number, default: 0 },
    noShowRate: { type: Number, default: 0 },
  },
  { timestamps: true },
);
schema.index({ location: '2dsphere' });
export const Organization = mongoose.model('Organization', schema);
