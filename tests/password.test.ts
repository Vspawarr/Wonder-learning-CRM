import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { lockMessage, recordFailedLogin, recordGoodLogin, requestPasswordReset, resetPassword } from "@/server/password";
import { makeUser, resetData } from "./helpers";

beforeEach(async () => {
  await resetData();
});

describe("sign-in protection", () => {
  it("locks after 5 wrong passwords and unlocks on a good one", async () => {
    const u = await makeUser("SALES_EXECUTIVE");
    for (let i = 0; i < 4; i++) await recordFailedLogin(u.id);
    expect(await lockMessage(u.email)).toBeNull();
    await recordFailedLogin(u.id);
    expect(await lockMessage(u.email)).toMatch(/locked until/);
    await recordGoodLogin(u.id);
    expect(await lockMessage(u.email)).toBeNull();
  });
});

describe("forgot password", () => {
  it("says nothing can be sent until email is set up", async () => {
    const u = await makeUser("SALES_EXECUTIVE");
    expect(await requestPasswordReset(u.email, "https://x")).toEqual({ sent: false });
  });

  it("a reset link works once, within an hour, and clears a lock", async () => {
    const u = await makeUser("SALES_EXECUTIVE");
    await db.user.update({ where: { id: u.id }, data: { lockedUntil: new Date(Date.now() + 600_000) } });
    const token = "test-token-0123456789abcdef";
    await db.passwordReset.create({
      data: { userId: u.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) },
    });
    await expect(resetPassword(token, "short")).rejects.toThrow(/8 characters/);
    await resetPassword(token, "brand-new-pass");
    const after = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await bcrypt.compare("brand-new-pass", after.passwordHash)).toBe(true);
    expect(after.lockedUntil).toBeNull();
    await expect(resetPassword(token, "another-pass-1")).rejects.toThrow(/expired or was already used/);
    await expect(resetPassword("nope", "another-pass-1")).rejects.toThrow(/expired/);
  });
});
