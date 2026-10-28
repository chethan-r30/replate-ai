// Reserve exactly one listing. Compensation restores state if claim persistence fails.
import mongoose from 'mongoose';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { FoodListing } from '../models/FoodListing.js';
import { Claim } from '../models/Claim.js';
import { Organization } from '../models/Organization.js';
import { AppError } from '../middleware/errors.js';
export const transitions = {
  requested: ['approved', 'rejected', 'cancelled', 'no_show'],
  approved: ['picked_up', 'cancelled', 'no_show'],
  rejected: [],
  picked_up: [],
  cancelled: [],
  no_show: [],
};
export function canTransition(from, to) {
  return Boolean(transitions[from]?.includes(to));
}
export async function createClaim(listingId, ngo) {
  const id = new mongoose.Types.ObjectId();
  const listing = await FoodListing.findOneAndUpdate(
    {
      _id: listingId,
      status: 'available',
      bestBefore: { $gt: new Date() },
      'pickupWindow.end': { $gt: new Date() },
    },
    { $set: { status: 'reserved', reservedBy: ngo._id, activeClaim: id } },
    { new: true },
  );
  if (!listing) {
    const existing = await FoodListing.findOne({
      _id: listingId,
      reservedBy: ngo._id,
      status: 'reserved',
    }).lean();
    if (existing?.activeClaim) {
      const claim = await Claim.findById(existing.activeClaim)
        .select('+pickupCode')
        .lean();
      if (claim) return claim;
    }
    throw new AppError(409, 'Listing is no longer available');
  }
  if (String(listing.restaurant) === String(ngo._id)) {
    await FoodListing.updateOne(
      { _id: listingId, activeClaim: id },
      {
        $set: { status: 'available' },
        $unset: { reservedBy: 1, activeClaim: 1 },
      },
    );
    throw new AppError(403, 'Cannot claim your own listing');
  }
  try {
    return await Claim.create({
      _id: id,
      listing: listingId,
      ngo: ngo._id,
      restaurant: listing.restaurant,
      pickupCode: String(randomInt(100000, 1000000)),
    });
  } catch (error) {
    await FoodListing.updateOne(
      { _id: listingId, activeClaim: id },
      {
        $set: { status: 'available' },
        $unset: { reservedBy: 1, activeClaim: 1 },
      },
    );
    throw error;
  }
}
export async function changeClaim(claimId, user, action, code) {
  const org = await Organization.findOne({ owner: user._id });
  if (!org) throw new AppError(403, 'Organization required');
  const claim = await Claim.findById(claimId).select('+pickupCode');
  if (!claim) throw new AppError(404, 'Claim not found');
  const restaurant = String(org._id) === String(claim.restaurant),
    ngo = String(org._id) === String(claim.ngo);
  if (
    ['approved', 'rejected', 'picked_up', 'no_show'].includes(action) &&
    !restaurant
  )
    throw new AppError(403, 'Restaurant confirmation required');
  if (action === 'cancelled' && !restaurant && !ngo)
    throw new AppError(403, 'Permission denied');
  if (!canTransition(claim.status, action))
    throw new AppError(409, 'Invalid claim transition');
  const listing = await FoodListing.findById(claim.listing);
  if (
    !listing ||
    listing.status !== 'reserved' ||
    String(listing.activeClaim) !== String(claim._id)
  )
    throw new AppError(409, 'Listing reservation changed');
  if (action === 'picked_up') {
    if (
      listing.bestBefore <= new Date() ||
      listing.pickupWindow.end <= new Date()
    )
      throw new AppError(409, 'Food pickup window has expired');
    const supplied = Buffer.from(code || '');
    const expected = Buffer.from(claim.pickupCode);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    )
      throw new AppError(400, 'Incorrect pickup code');
  }
  const changed = await Claim.findOneAndUpdate(
    { _id: claim._id, status: claim.status },
    {
      $set: {
        status: action,
        ...(action === 'picked_up' ? { pickedUpAt: new Date() } : {}),
      },
    },
    { new: true },
  );
  if (!changed) throw new AppError(409, 'Claim changed; retry');
  if (action === 'picked_up')
    await FoodListing.updateOne(
      { _id: listing._id, activeClaim: claim._id, status: 'reserved' },
      { $set: { status: 'picked_up' } },
    );
  else if (['rejected', 'cancelled', 'no_show'].includes(action))
    await FoodListing.updateOne(
      { _id: listing._id, activeClaim: claim._id, status: 'reserved' },
      {
        $set: {
          status: listing.bestBefore > new Date() ? 'available' : 'expired',
        },
        $unset: { reservedBy: 1, activeClaim: 1 },
      },
    );
  const safe = changed.toObject();
  delete safe.pickupCode;
  return safe;
}
