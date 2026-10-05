import { defineConfig } from "drizzle-kit";

// Gera as migrations SQL versionadas em ./drizzle (aplicadas com `wrangler d1 migrations apply`).
export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
