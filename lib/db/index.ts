import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("db pool idle client error:", err.message);
});

export const db = drizzle(pool, { schema });
export { schema };
