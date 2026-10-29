import { monitorEventLoopDelay } from 'node:perf_hooks';
import { printProfile } from '../../server/src/lib/profile.js';
// Isolate the API event loop from the CPU-heavy load generator.
import mongoose from 'mongoose';
import { createApp } from '../../server/src/app.js';
import { parseEnv } from '../../server/src/config/env.js';
import '../../server/src/models/User.js';
import '../../server/src/models/Organization.js';
import '../../server/src/models/FoodListing.js';
import '../../server/src/models/Claim.js';
const config = parseEnv(process.env);
await mongoose.connect(config.MONGODB_URI, {
  maxPoolSize: 200,
  monitorCommands: process.env.PROFILE_DB === '1',
});
// Readiness includes model/index initialization, not first-request DDL.
await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
// Diagnostic only: distinguish server scheduling from durable storage stalls.
const eventLoop = monitorEventLoopDelay({ resolution: 10 });
eventLoop.enable();
const timings = {};
const slowCommands = [];

if (process.env.PROFILE_DB === '1')
  mongoose.connection.getClient().on('commandSucceeded', (event) => {
    (timings[event.commandName] ??= []).push(event.duration);
    if (event.duration >= 50 && slowCommands.length < 50)
      slowCommands.push({
        command: event.commandName,
        durationMs: event.duration,
        at: Date.now(),
      });
  });
const server = createApp(config).listen(0);
await new Promise((r) => server.once('listening', r));
process.send({ port: server.address().port });
process.once('message', () =>
  server.close(async () => {
    eventLoop.disable();
    console.error(
      'Server runtime diagnostic',
      JSON.stringify({
        eventLoopMs: {
          p95: eventLoop.percentile(95) / 1e6,
          max: eventLoop.max / 1e6,
        },
        resourceUsage: process.resourceUsage(),
        slowCommands,
      }),
    );
    printProfile();
    for (const [name, times] of Object.entries(timings)) {
      times.sort((a, b) => a - b);
      console.error('DB profile', name, {
        count: times.length,
        p95Ms: times[Math.ceil(times.length * 0.95) - 1],
      });
    }
    await mongoose.disconnect();
    process.exit(0);
  }),
);
