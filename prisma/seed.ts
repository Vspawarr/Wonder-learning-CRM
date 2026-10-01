// Seeds only real data: the Phase 1 product catalogue (no prices yet) and the
// initial team from seed-users.ts (passwords from env vars). No sample leads,
// opportunities or tasks. Safe to re-run: existing rows are left unchanged.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { INITIAL_PRODUCTS } from "../src/lib/constants";
import { INITIAL_USERS } from "./seed-users";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function seedProducts() {
  // Only on a brand-new database: after that, products are managed (and may be deleted) in the app.
  if (await prisma.product.count()) {
    console.log("Products: already set up, left unchanged");
    return;
  }
  for (const [i, p] of INITIAL_PRODUCTS.entries()) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: {}, // never overwrite prices or edits made in the app
      create: { ...p, type: "SERVICE", sortOrder: i + 1 },
    });
  }
  console.log(`Products: ${INITIAL_PRODUCTS.length} ensured`);
}

async function seedUsers() {
  for (const u of INITIAL_USERS) {
    const email = u.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`${u.name}: already exists, left unchanged`);
      continue;
    }
    const password = process.env[u.passwordEnv];
    if (!password) {
      console.log(`${u.name}: skipped (${u.passwordEnv} not set)`);
      continue;
    }
    if (password.length < 8) throw new Error(`${u.passwordEnv} must be at least 8 characters`);
    await prisma.user.create({
      data: { name: u.name, email, role: u.role, passwordHash: await bcrypt.hash(password, 12) },
    });
    console.log(`${u.name}: created`);
  }
}

async function main() {
  await seedProducts();
  await seedUsers();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
