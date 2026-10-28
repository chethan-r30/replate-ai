// Explainable matching keeps every signal bounded from zero to one.
import { z } from 'zod';
export const matchWeights = {
  distance: 0.25,
  pickup: 0.2,
  fit: 0.2,
  capacity: 0.15,
  reliability: 0.15,
  urgency: 0.05,
};
const clamp = (n) => Math.max(0, Math.min(1, n));
export function scoreMatch(
  listing,
  ngo,
  { distanceMeters = 0, radiusMeters = 10000, now = new Date() } = {},
) {
  z.number().nonnegative().parse(distanceMeters);
  z.number().positive().parse(radiusMeters);
  const start = new Date(listing.pickupWindow.start),
    end = new Date(listing.pickupWindow.end),
    deadline = new Date(listing.bestBefore);
  const travelHours = distanceMeters / 1000 / 20;
  const earliest = new Date(
    Math.max(start.getTime(), now.getTime() + travelHours * 3600000),
  );
  const timezone = ngo.timezone;
  let feasible = false;
  if (timezone) {
    try {
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      const hours = ngo.operatingHours || { start: 0, end: 24 };
      // Check the whole feasible pickup interval so a later opening is not rejected.
      const latest = Math.min(
        end.getTime(),
        deadline.getTime(),
        earliest.getTime() + 48 * 3600000,
      );
      for (let t = earliest.getTime(); t < latest; t += 60000) {
        const parts = formatter.formatToParts(new Date(t));
        const hour =
          Number(parts.find((p) => p.type === 'hour').value) +
          Number(parts.find((p) => p.type === 'minute').value) / 60;
        if (hour >= hours.start && hour < hours.end) {
          feasible = true;
          break;
        }
      }
    } catch {
      feasible = false;
    }
  }
  const categories = ngo.preferences?.categories || [],
    dietary = ngo.preferences?.dietary || [];
  const fitsCategory =
    !categories.length || categories.includes(listing.category);
  const fitsDietary = dietary.every((tag) =>
    (listing.dietary || []).includes(tag),
  );
  const remaining = Math.max(0, (ngo.capacity || 0) - (ngo.claimedToday || 0));
  const breakdown = {
    distance: clamp(1 - distanceMeters / radiusMeters),
    pickup: feasible ? 1 : 0,
    fit: fitsCategory && fitsDietary ? 1 : 0,
    capacity: clamp(remaining / Math.max(1, listing.servings)),
    reliability: clamp(
      (1 - (ngo.noShowRate || 0)) * 0.7 + clamp((ngo.rating || 0) / 5) * 0.3,
    ),
    urgency: clamp(1 - (deadline - now) / (24 * 3600000)),
  };
  const eligible =
    feasible && fitsCategory && fitsDietary && remaining >= listing.servings;
  const score = eligible
    ? Math.round(
        Object.entries(matchWeights).reduce(
          (s, [key, weight]) => s + breakdown[key] * weight,
          0,
        ) * 10000,
      ) / 100
    : 0;
  return {
    score,
    eligible,
    breakdown,
    explanation: eligible
      ? 'Fits food preferences and capacity within the pickup window.'
      : 'Pickup timing, food fit or remaining capacity does not meet this listing.',
  };
}
export function rankMatches(listing, ngos, options = {}) {
  return ngos
    .map((ngo) => ({
      ...ngo,
      ...scoreMatch(listing, ngo, {
        ...options,
        distanceMeters: ngo.distanceMeters || 0,
      }),
    }))
    .filter((x) => x.eligible)
    .sort((a, b) => b.score - a.score || a.distanceMeters - b.distanceMeters)
    .slice(0, options.limit || 10);
}
