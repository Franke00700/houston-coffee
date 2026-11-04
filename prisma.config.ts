import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // `prisma generate` does not connect to PostgreSQL and must also work in a
  // clean build environment. Commands that access the database still receive
  // DIRECT_URL/DATABASE_URL from the deployment secret store.
  datasource: {
    url:
      process.env.DIRECT_URL ??
      process.env.DATABASE_URL ??
      "postgresql://unused:unused@127.0.0.1:5432/unused",
  },
});
