import { it, expect } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { seedDemo } from './seed.js';
import { User } from '../server/src/models/User.js';
import { FoodListing } from '../server/src/models/FoodListing.js';
import { SurplusHistory } from '../server/src/models/SurplusHistory.js';
it('seeds exact synthetic counts without overwriting data and refuses unapproved remote targets', async () => {
  await expect(
    seedDemo({
      uri: 'mongodb+srv://example.com/demo',
      password: 'DemoOnlyStrong123!',
    }),
  ).rejects.toThrow(/Remote seed/);
  const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  try {
    expect(
      await seedDemo({ uri: mongo.getUri(), password: 'DemoOnlyStrong123!' }),
    ).toEqual({
      users: 7,
      restaurants: 3,
      ngos: 3,
      listings: 20,
      historyDays: 60,
      historyRecords: 180,
    });
    expect(await User.countDocuments()).toBe(7);
    expect(await FoodListing.countDocuments()).toBe(20);
    expect(await SurplusHistory.countDocuments()).toBe(180);
    expect(
      new Set(
        (await SurplusHistory.find().lean()).map((x) =>
          x.date.toISOString().slice(0, 10),
        ),
      ).size,
    ).toBe(60);
    await expect(
      seedDemo({ uri: mongo.getUri(), password: 'DemoOnlyStrong123!' }),
    ).rejects.toThrow(/already exist/);
    expect(await User.countDocuments()).toBe(7);
  } finally {
    await mongoose.disconnect();
    await mongo.stop();
  }
}, 30000);
