import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // ponytail: non-null assert is fine — drizzle-kit is a dev-time CLI
    url: process.env.DATABASE_URL!,
  },
});
