import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  // The app only queries the DB once a day (the screen cron), so Neon's
  // compute is usually suspended and needs to cold-start on connect — 5s
  // wasn't enough margin and caused real production failures.
  connectionTimeoutMillis: 15_000,
});

pool.on("error", (err) => {
  console.error("db pool idle client error:", err.message);
});

export const db = drizzle(pool, { schema });
export { schema };
