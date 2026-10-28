// Users never expose password hashes or token digests through public serializers.
import mongoose from 'mongoose';
const schema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['restaurant', 'ngo', 'volunteer', 'admin'],
      required: true,
    },
    isEmailVerified: { type: Boolean, default: false },
    verificationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    phone: String,
    avatar: String,
    loginFailures: { type: Number, default: 0 },
    lockedUntil: Date,
    deletedAt: Date,
  },
  { timestamps: true },
);
export const User = mongoose.model('User', schema);
export const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  isEmailVerified: user.isEmailVerified,
  verificationStatus: user.verificationStatus,
});
