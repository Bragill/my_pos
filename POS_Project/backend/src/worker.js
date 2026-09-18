import app from './app';
import { setWorkerBindings } from './database/dbHelper';
import batchService from './services/batchService';
import lineService from './services/lineService';
import { createExpressHandler } from './adapters/cloudflareExpress';

const handleFetch = createExpressHandler(app);

export default {
  async fetch(request, env, ctx) {
    // 1. Inject Cloudflare Worker bindings (D1, R2, secrets) into runtime
    setWorkerBindings(env);

    // 2. Sync Worker environment variables with process.env
    if (typeof process !== 'undefined' && process.env) {
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string' && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }

    // 3. Delegate HTTP request handling to Express
    return handleFetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    // Cloudflare Cron Trigger
    setWorkerBindings(env);
    if (typeof process !== 'undefined' && process.env) {
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string' && !process.env[key]) {
          process.env[key] = value;
        }
      }
    }

    // 1. Batch expiry check
    ctx.waitUntil(
      batchService.runExpiryCheck().catch((err) => {
        console.error('[Scheduled Worker] Expiry check failed:', err.message);
      })
    );

    // 2. Automated daily sales report via LINE
    ctx.waitUntil(
      lineService.sendAutomatedDailyReports().catch((err) => {
        console.error('[Scheduled Worker] LINE report failed:', err.message);
      })
    );
  },
};

