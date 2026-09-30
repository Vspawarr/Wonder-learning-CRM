import { execSync } from "node:child_process";
import "dotenv/config";

// Tests run against a separate, throwaway database: migrations are applied
// here and each test clears the rows it uses (tests/helpers.ts).
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL (a throwaway database) to run the tests.");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL.");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
