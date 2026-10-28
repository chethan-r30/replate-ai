// Production entrypoint requires valid configuration and a reachable database.
import 'dotenv/config';
import {
  configureSharedCache,
  closeSharedCache,
} from './services/shared-cache.js';
import { configureNotifications } from './services/notifications.js';
import { startRealtime } from './services/realtime.js';
import { startExpiryJob } from './jobs/expiry.js';
import { parseEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { createApp } from './app.js';
import { logger } from './lib/logger.js';
export async function start(config) {
  configureNotifications(config);
  await configureSharedCache(config.REDIS_URL);
  await connectDatabase(config.MONGODB_URI);
  const expiryJob = startExpiryJob();
  const server = createApp(config).listen(config.PORT, '0.0.0.0', () =>
    logger.info({ port: config.PORT }, 'API started'),
  );
  const io = startRealtime(server, config);
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () =>
      server.close(async () => {
        expiryJob.stop();
        io.close();
        await closeSharedCache();
        await disconnectDatabase();
        process.exit(0);
      }),
    );
  return server;
}
if (process.argv[1] === new URL(import.meta.url).pathname)
  start(parseEnv(process.env)).catch((error) => {
    logger.fatal({ message: error.message }, 'Startup failed');
    process.exit(1);
  });
