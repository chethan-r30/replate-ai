import { Notification } from '../models/Notification.js';
import { emitNotification } from './realtime.js';
import { sendPlainEmail } from '../lib/mail.js';
import { notificationConfig } from './notifications.js';
import { clearCache } from './cache.js';
// Reserve exactly one listing. Compensation restores state if claim persistence fails.
import mongoose from 'mongoose';
import { randomInt, timingSafeEqual } from 'node:crypto';
import { FoodListing } from '../models/FoodListing.js';
import { SurplusHistory } from '../models/SurplusHistory.js';
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
async function reserveClaim(listingId, ngo) {
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
      if (claim) return { claim, created: false };
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
    const claim = await Claim.create({
      _id: id,
      listing: listingId,
      ngo: ngo._id,
      restaurant: listing.restaurant,
      pickupCode: String(randomInt(100000, 1000000)),
    });
    return { claim, created: true };
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
async function transitionClaim(claimId, user, action, code) {
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
  if (action === 'picked_up') {
    await SurplusHistory.updateOne(
      { listing: listing._id },
      { $set: { quantityClaimed: listing.servings } },
    );
    await FoodListing.updateOne(
      { _id: listing._id, activeClaim: claim._id, status: 'reserved' },
      { $set: { status: 'picked_up' } },
    );
  } else if (['rejected', 'cancelled', 'no_show'].includes(action))
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

// MongoDB 8 transactionAsyncLocalStorage attaches every operation to this transaction.
mongoose.set('transactionAsyncLocalStorage', true);
// A short process-local microbatch shares database round trips, never acknowledges
// until its transaction commits. A process crash loses only unanswered requests.
let waiting = [];
let scheduled = false;
export function createClaim(listingId, ngo) {
  return new Promise((resolve, reject) => {
    waiting.push({ listingId: String(listingId), ngo, resolve, reject });
    if (!scheduled) {
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        const batch = waiting;
        waiting = [];
        // Bound each transaction; overlapping chunks still use compare-and-swap.
        for (let offset = 0; offset < batch.length; offset += 200)
          persistClaimBatch(batch.slice(offset, offset + 200));
      }, 25);
    }
  });
}
async function persistClaimBatch(batch) {
  try {
    const committed = await mongoose.connection.transaction(async () => {
      async function persistNotices(results, newIds) {
        const unique = [
          ...new Map(
            results
              .filter((x) => !(x instanceof Error) && newIds.has(String(x._id)))
              .map((x) => [String(x._id), x]),
          ).values(),
        ];
        const orgs = await Organization.find({
          _id: { $in: unique.map((x) => x.restaurant) },
        })
          .select('owner')
          .lean();
        const owners = new Map(orgs.map((x) => [String(x._id), x.owner]));
        const notices = unique
          .filter((x) => owners.has(String(x.restaurant)))
          .map((x) => ({
            user: owners.get(String(x.restaurant)),
            type: 'claim-request',
            message: 'A new food claim is waiting for your review.',
            createdAt: new Date(),
            updatedAt: new Date(),
          }));
        return {
          results,
          notices: notices.length
            ? await Notification.insertMany(notices, { lean: true })
            : [],
        };
      }
      if (batch.length === 1) {
        const { claim, created } = await reserveClaim(
          batch[0].listingId,
          batch[0].ngo,
        );
        return persistNotices(
          [claim],
          new Set(created ? [String(claim._id)] : []),
        );
      }
      const listings = await FoodListing.find({
        _id: { $in: batch.map((x) => x.listingId) },
      }).lean();
      const available = new Map(listings.map((x) => [String(x._id), x]));
      const pending = new Map(),
        results = [],
        updates = [],
        claims = [];
      const now = new Date();
      for (const item of batch) {
        const listing = available.get(item.listingId);
        const duplicate = pending.get(item.listingId);
        if (duplicate) {
          results.push(
            String(duplicate.ngo) === String(item.ngo._id)
              ? duplicate
              : new AppError(409, 'Listing is no longer available'),
          );
          continue;
        }
        if (
          !listing ||
          listing.status !== 'available' ||
          listing.bestBefore <= now ||
          listing.pickupWindow.end <= now
        ) {
          if (
            listing?.status === 'reserved' &&
            String(listing.reservedBy) === String(item.ngo._id) &&
            listing.activeClaim
          ) {
            const previous = await Claim.findById(listing.activeClaim)
              .select('+pickupCode')
              .lean();
            results.push(
              previous || new AppError(409, 'Listing is no longer available'),
            );
          } else
            results.push(new AppError(409, 'Listing is no longer available'));
          continue;
        }
        if (String(listing.restaurant) === String(item.ngo._id)) {
          results.push(new AppError(403, 'Cannot claim your own listing'));
          continue;
        }
        const claim = {
          _id: new mongoose.Types.ObjectId(),
          listing: listing._id,
          ngo: item.ngo._id,
          restaurant: listing.restaurant,
          pickupCode: String(randomInt(100000, 1000000)),
          status: 'requested',
          createdAt: now,
          updatedAt: now,
        };
        pending.set(item.listingId, claim);
        claims.push(claim);
        results.push(claim);
        updates.push({
          updateOne: {
            filter: {
              _id: listing._id,
              status: 'available',
              bestBefore: { $gt: now },
              'pickupWindow.end': { $gt: now },
            },
            update: {
              $set: {
                status: 'reserved',
                reservedBy: item.ngo._id,
                activeClaim: claim._id,
              },
            },
          },
        });
      }
      if (updates.length) {
        const changed = await FoodListing.bulkWrite(updates);
        if (changed.matchedCount !== updates.length)
          throw new AppError(409, 'Reservation changed; retry');
        // Values are generated here, not copied from caller input.
        await Claim.insertMany(claims, { lean: true });
      }
      return persistNotices(results, new Set(claims.map((x) => String(x._id))));
    });
    const { results, notices } = committed;
    for (const notice of notices) {
      emitNotification(notice.user, {
        id: notice._id,
        type: notice.type,
        message: notice.message,
      });
      sendPlainEmail(notice.user, notice.message, notificationConfig()).catch(
        () => {},
      );
    }
    clearCache();
    batch.forEach((item, index) =>
      results[index] instanceof Error
        ? item.reject(results[index])
        : item.resolve(results[index]),
    );
  } catch (error) {
    batch.forEach((item) => item.reject(error));
  }
}
export async function changeClaim(claimId, user, action, code) {
  const claim = await mongoose.connection.transaction(() =>
    transitionClaim(claimId, user, action, code),
  );
  clearCache();
  return claim;
}
