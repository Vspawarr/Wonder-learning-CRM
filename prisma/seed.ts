// Seeds only real master data: the Phase 1 product catalogue (no prices yet)
// and the two initial Director accounts from env vars. No sample leads,
// opportunities or users — those are created in the app.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { INITIAL_PRODUCTS } from "../src/lib/constants";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function seedProducts() {
  for (const [i, p] of INITIAL_PRODUCTS.entries()) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: {}, // never overwrite prices or edits made in the app
      create: { ...p, type: "SERVICE", sortOrder: i + 1 },
    });
  }
  console.log(`Products: ${INITIAL_PRODUCTS.length} ensured`);
}

async function seedAdmins() {
  for (const n of [1, 2]) {
    const name = process.env[`ADMIN${n}_NAME`]?.trim();
    const email = process.env[`ADMIN${n}_EMAIL`]?.trim().toLowerCase();
    const password = process.env[`ADMIN${n}_PASSWORD`];
    if (!name || !email || !password) {
      console.log(`Admin ${n}: skipped (ADMIN${n}_NAME/EMAIL/PASSWORD not all set)`);
      continue;
    }
    if (password.length < 8) throw new Error(`ADMIN${n}_PASSWORD must be at least 8 characters`);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.user.update({ where: { email }, data: { name, role: "DIRECTOR", active: true } });
      console.log(`Admin ${n}: already exists, password left unchanged`);
    } else {
      await prisma.user.create({
        data: { name, email, role: "DIRECTOR", passwordHash: await bcrypt.hash(password, 12) },
      });
      console.log(`Admin ${n}: created`);
    }
  }
}

async function main() {
  await seedProducts();
  await seedAdmins();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
