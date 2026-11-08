// Next.js loads .env.local and .env on its own; the Prisma CLI and the seed
// script don't, so load them here with the same precedence.
import { config } from "dotenv";

const env = process.env.NODE_ENV;

config({
  path: env === "production" ? [".env.prod"] : [".env.local", ".env"],
  quiet: true,
});
