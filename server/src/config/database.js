// Reuse one MongoDB connection and stop cleanly during shutdown.
import mongoose from 'mongoose';
export async function connectDatabase(uri) {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 100,
    minPoolSize: 5,
  });
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
}
export async function disconnectDatabase() {
  await mongoose.disconnect();
}
export const databaseReady = () => mongoose.connection.readyState === 1;
