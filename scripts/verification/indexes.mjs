// Explain plans are verified against disposable data, never production.
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { writeFile } from 'node:fs/promises';
import { FoodListing } from '../../server/src/models/FoodListing.js';
import { Organization } from '../../server/src/models/Organization.js';
import { SurplusHistory } from '../../server/src/models/SurplusHistory.js';
const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
try {
  await mongoose.connect(mongo.getUri());
  await Promise.all([
    FoodListing.init(),
    Organization.init(),
    SurplusHistory.init(),
  ]);
  const id = new mongoose.Types.ObjectId();
  await FoodListing.insertMany(
    Array.from({ length: 500 }, (_, i) => ({
      restaurant: id,
      title: 'Bread ' + i,
      category: 'bakery',
      quantity: 10,
      unit: 'items',
      servings: 10,
      bestBefore: new Date(Date.now() + 7200000),
      pickupWindow: { start: new Date(), end: new Date(Date.now() + 3600000) },
      location: { type: 'Point', coordinates: [77.59 + i * 0.0001, 12.97] },
      status: 'available',
    })),
  );
  const plans = {
    status: await FoodListing.find({
      status: 'available',
      bestBefore: { $gt: new Date() },
    })
      .sort({ bestBefore: 1 })
      .limit(20)
      .explain('executionStats'),
    restaurant: await FoodListing.find({ restaurant: id })
      .sort({ createdAt: -1 })
      .limit(20)
      .explain('executionStats'),
    geo: await FoodListing.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [77.59, 12.97] },
          distanceField: 'distanceMeters',
          spherical: true,
          maxDistance: 10000,
          query: { status: 'available' },
        },
      },
      { $limit: 20 },
    ]).explain('executionStats'),
  };
  await writeFile(
    'test-results/index-plans.json',
    JSON.stringify(plans, null, 2),
  );
  for (const [name, p] of Object.entries(plans)) {
    const text = JSON.stringify(p);
    if (!/IXSCAN|GEO_NEAR_2DSPHERE/.test(text))
      throw new Error(name + ' did not use an index');
    console.log(name, 'index plan verified');
  }
} finally {
  await mongoose.disconnect();
  await mongo.stop();
}
