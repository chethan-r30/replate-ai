// Seed synthetic demo data only. Never wipes or overwrites existing accounts.
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { pathToFileURL } from 'node:url';
import { User } from '../server/src/models/User.js';
import { Organization } from '../server/src/models/Organization.js';
import { FoodListing } from '../server/src/models/FoodListing.js';
import { SurplusHistory } from '../server/src/models/SurplusHistory.js';
export async function seedDemo({ uri, password, allowRemote = false }) {
  if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri))
    throw new Error('MONGODB_URI required');
  if (
    !allowRemote &&
    !/^mongodb:\/\/(?:localhost|127\.0\.0\.1)(?::|\/)/.test(uri)
  )
    throw new Error(
      'Remote seed requires SEED_ALLOW_REMOTE=true and an isolated demo database',
    );
  if (!password || password.length < 12 || password.includes('REPLACE_ME'))
    throw new Error(
      'Set a unique SEED_PASSWORD of at least12 characters in the environment',
    );
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  if (await User.exists({ email: /@demo\.replate\.invalid$/ }))
    throw new Error(
      'Demo accounts already exist; seed does not overwrite data',
    );
  const hash = await bcrypt.hash(password, 12);
  return mongoose.connection.transaction(async () => {
    const users = await User.create([
      {
        name: 'Demo admin',
        email: 'admin@demo.replate.invalid',
        role: 'admin',
        passwordHash: hash,
        isEmailVerified: true,
        verificationStatus: 'approved',
      },
      ...['restaurant', 'ngo'].flatMap((role) =>
        Array.from({ length: 3 }, (_, i) => ({
          name: `Demo ${role} ${i + 1}`,
          email: `${role}${i + 1}@demo.replate.invalid`,
          role,
          passwordHash: hash,
          isEmailVerified: true,
          verificationStatus: 'approved',
        })),
      ),
    ]);
    const organizations = await Organization.create(
      users.slice(1).map((u, i) => ({
        owner: u._id,
        type: u.role,
        name: `Demo ${u.role} ${(i % 3) + 1}`,
        registrationNo: `SYNTHETIC-${i + 1}`,
        timezone: 'Asia/Kolkata',
        address: 'Synthetic demo location, not a real food pickup',
        location: {
          type: 'Point',
          coordinates: [77.59 + i * 0.005, 12.97 + i * 0.005],
        },
        verificationDocs: ['https://example.com/synthetic-proof'],
        verificationStatus: 'approved',
        capacity: 200,
        preferences: {
          categories: ['bakery', 'produce', 'packaged'],
          dietary: ['veg'],
        },
      })),
    );
    const restaurants = organizations.filter((x) => x.type === 'restaurant');
    const now = Date.now();
    await FoodListing.insertMany(
      Array.from({ length: 20 }, (_, i) => ({
        restaurant: restaurants[i % 3]._id,
        title: `Demo surplus ${i + 1}`,
        description:
          'Synthetic demonstration only. Not food available for collection.',
        category: ['bakery', 'produce', 'packaged'][i % 3],
        dietary: ['veg'],
        quantity: 10 + i,
        unit: 'items',
        servings: 10 + i,
        preparedAt: new Date(now - 3600000),
        bestBefore: new Date(now + 86400000),
        pickupWindow: { start: new Date(now), end: new Date(now + 7200000) },
        location: restaurants[i % 3].location,
      })),
    );
    await SurplusHistory.insertMany(
      restaurants.flatMap((org, index) =>
        Array.from({ length: 60 }, (_, day) => {
          const date = new Date(now - (day + 1) * 86400000);
          return {
            restaurant: org._id,
            date,
            dayOfWeek: date.getUTCDay(),
            category: 'bakery',
            quantityPosted: 20 + ((day + index) % 12),
            quantityClaimed: 12 + ((day + index) % 10),
          };
        }),
      ),
    );
    return {
      users: users.length,
      restaurants: 3,
      ngos: 3,
      listings: 20,
      historyDays: 60,
      historyRecords: 180,
    };
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(
      await seedDemo({
        uri: process.env.MONGODB_URI,
        password: process.env.SEED_PASSWORD,
        allowRemote: process.env.SEED_ALLOW_REMOTE === 'true',
      }),
    );
  } catch (error) {
    console.error(
      error.name === 'MongoServerSelectionError'
        ? 'Demo database connection failed; verify URI/network access'
        : error.message,
    );
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
