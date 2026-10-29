// Query nearby approved NGOs and subtract today's allocated capacity.
import mongoose from 'mongoose';
import { sendPlainEmail } from '../lib/mail.js';
import { notificationConfig } from './notifications.js';
import { emitNotification } from './realtime.js';
import { Organization } from '../models/Organization.js';
import { Feedback } from '../models/Feedback.js';
import { Claim } from '../models/Claim.js';
import { FoodListing } from '../models/FoodListing.js';
import { Notification } from '../models/Notification.js';
import { rankMatches, scoreMatch } from '../ai/match.js';
export async function recommendations(
  listing,
  { radius = 10000, limit = 10 } = {},
) {
  const candidates = await Organization.aggregate([
    {
      $geoNear: {
        near: listing.location,
        distanceField: 'distanceMeters',
        spherical: true,
        maxDistance: radius,
        query: { type: 'ngo', verificationStatus: 'approved' },
      },
    },
    { $limit: 200 },
  ]);
  if (!candidates.length) return [];
  // Derive reliability from real terminal claims and participant feedback.
  const ids = candidates.map((x) => x._id);
  const [outcomes, ratings] = await Promise.all([
    Claim.aggregate([
      {
        $match: {
          ngo: { $in: ids },
          status: { $in: ['picked_up', 'no_show'] },
        },
      },
      {
        $group: {
          _id: '$ngo',
          total: { $sum: 1 },
          missed: { $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] } },
        },
      },
    ]),
    Feedback.aggregate([
      { $match: { to: { $in: ids } } },
      { $group: { _id: '$to', average: { $avg: '$rating' } } },
    ]),
  ]);
  for (const candidate of candidates) {
    const outcome = outcomes.find(
      (x) => String(x._id) === String(candidate._id),
    );
    const rating = ratings.find((x) => String(x._id) === String(candidate._id));
    candidate.noShowRate = outcome ? outcome.missed / outcome.total : 0;
    candidate.rating = rating?.average || 0;
  }
  const now = new Date();
  // Per-NGO local calendar days can start up to 26 hours apart.
  const day = new Date(now.getTime() - 48 * 3600000);
  const totals = await Claim.aggregate([
    {
      $match: {
        ngo: { $in: candidates.map((x) => x._id) },
        createdAt: { $gte: day },
        status: { $in: ['requested', 'approved', 'picked_up'] },
      },
    },
    {
      $lookup: {
        from: 'foodlistings',
        localField: 'listing',
        foreignField: '_id',
        as: 'food',
      },
    },
    { $unwind: '$food' },
    { $project: { ngo: 1, createdAt: 1, servings: '$food.servings' } },
  ]);
  const used = new Map();
  for (const candidate of candidates) {
    const localDay = (date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: candidate.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    const id = String(candidate._id);
    used.set(
      id,
      totals
        .filter(
          (x) =>
            String(x.ngo) === id && localDay(x.createdAt) === localDay(now),
        )
        .reduce((sum, x) => sum + x.servings, 0),
    );
  }
  return rankMatches(
    listing,
    candidates.map((x) => ({
      ...x,
      claimedToday: used.get(String(x._id)) || 0,
    })),
    { radiusMeters: radius, limit },
  );
}
export async function notifyMatches(listingId) {
  let delivered = [];
  const count = await mongoose.connection.transaction(async () => {
    delivered = [];
    const listing = await FoodListing.findOne({
      _id: listingId,
      status: 'available',
      bestBefore: { $gt: new Date() },
    });
    if (!listing) return 0;
    const matches = await recommendations(listing, { limit: 100 });
    const next = matches
      .filter(
        (x) => !listing.notifiedOrgs.some((id) => String(id) === String(x._id)),
      )
      .slice(0, 3);
    if (!next.length) return 0;
    const changed = await FoodListing.updateOne(
      { _id: listing._id, updatedAt: listing.updatedAt },
      {
        $addToSet: { notifiedOrgs: { $each: next.map((x) => x._id) } },
        $set: { lastNotifiedAt: new Date() },
      },
    );
    if (!changed.modifiedCount) return 0;
    await Notification.insertMany(
      next.map((x) => ({
        user: x.owner,
        type: 'nearby-listing',
        message: `Nearby surplus: ${listing.title}. Review the pickup window before claiming.`,
      })),
    );
    delivered = next;
    return next.length;
  });
  for (const org of delivered) {
    emitNotification(org.owner, { type: 'nearby-listing' });
    await sendPlainEmail(
      org.owner,
      'Nearby surplus is available. Review your ReplateAI notifications and the food pickup window.',
      notificationConfig(),
    );
  }
  return count;
}

// Rank nearby food for one NGO using the same transparent fit/capacity signals.
export async function recommendedListings(ngo, { page = 1, limit = 20 } = {}) {
  const now = new Date();
  const candidates = await FoodListing.aggregate([
    {
      $geoNear: {
        near: ngo.location,
        distanceField: 'distanceMeters',
        spherical: true,
        maxDistance: 10000,
        query: {
          status: 'available',
          bestBefore: { $gt: now },
          'pickupWindow.end': { $gt: now },
        },
      },
    },
    { $limit: 200 },
    { $project: { reservedBy: 0, activeClaim: 0, notifiedOrgs: 0 } },
  ]);
  const allocated = await Claim.aggregate([
    {
      $match: {
        ngo: ngo._id,
        createdAt: { $gte: new Date(now.getTime() - 48 * 3600000) },
        status: { $in: ['requested', 'approved', 'picked_up'] },
      },
    },
    {
      $lookup: {
        from: 'foodlistings',
        localField: 'listing',
        foreignField: '_id',
        as: 'food',
      },
    },
    { $unwind: '$food' },
    { $project: { createdAt: 1, servings: '$food.servings' } },
  ]);
  const day = (date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ngo.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  const claimedToday = allocated
    .filter((x) => day(x.createdAt) === day(now))
    .reduce((sum, x) => sum + x.servings, 0);
  const ranked = candidates
    .map((listing) => ({
      ...listing,
      match: scoreMatch(
        listing,
        { ...ngo, claimedToday },
        { distanceMeters: listing.distanceMeters, now },
      ),
    }))
    .filter((x) => x.match.eligible)
    .sort(
      (a, b) =>
        b.match.score - a.match.score || a.distanceMeters - b.distanceMeters,
    );
  return {
    items: ranked.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: ranked.length,
    candidateLimit: 200,
    radiusKm: 10,
  };
}
