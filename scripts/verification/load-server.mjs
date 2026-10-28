// Isolate the API event loop from the CPU-heavy load generator.
import mongoose from 'mongoose';
import { createApp } from '../../server/src/app.js';
import { parseEnv } from '../../server/src/config/env.js';
import '../../server/src/models/User.js';
import '../../server/src/models/Organization.js';
import '../../server/src/models/FoodListing.js';
import '../../server/src/models/Claim.js';
const config = parseEnv(process.env);
await mongoose.connect(config.MONGODB_URI, { maxPoolSize: 200 });
const server = createApp(config).listen(0);
await new Promise((r) => server.once('listening', r));
process.send({ port: server.address().port });
process.once('message', () =>
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  }),
);
