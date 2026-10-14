import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/dates";
import { createTask } from "@/server/tasks";
import { attentionAlerts, markAlerts, upcomingReminders } from "@/server/search";
import { makeUser, resetData } from "./helpers";

beforeEach(async () => {
  await resetData();
});

/** "HH:MM" India time, `min` minutes after `at`. */
const hm = (at: Date, min: number) => new Date(at.getTime() + min * 60e3 + 5.5 * 3600e3).toISOString().slice(11, 16);

describe("notifications (R45)", () => {
  it("reminds 15 minutes before a timed to-do, and remembers read / unread", async () => {
    // A fixed moment in the middle of the India day, so +10 / +40 minutes stay on the same date.
    const at = new Date(`${todayIST()}T06:30:00Z`);
    const ex = await makeUser("SALES_EXECUTIVE");
    const day = todayIST(at);
    await createTask(ex, { title: "Call Sunrise School", type: "Call", dueDate: day, dueTime: hm(at, 10), assigneeId: ex.id });
    await createTask(ex, { title: "Later call", type: "Call", dueDate: day, dueTime: hm(at, 40), assigneeId: ex.id });

    const soon = await upcomingReminders(ex, at);
    expect(soon).toHaveLength(1);
    expect(soon[0]).toMatchObject({ reminder: true, href: "/tasks" });
    expect(soon[0].text).toMatch(/^In 10 min: Call Sunrise School/);

    const all = await attentionAlerts(ex);
    expect(all.every((a) => a.key && a.read === false)).toBe(true);
    const today = all.find((a) => a.key.startsWith("tasks-today:"))!;
    expect(today).toBeTruthy();

    await markAlerts(ex, [today.key], true);
    expect((await attentionAlerts(ex)).find((a) => a.key === today.key)?.read).toBe(true);
    await markAlerts(ex, [today.key], false);
    expect((await attentionAlerts(ex)).find((a) => a.key === today.key)?.read).toBe(false);

    // A new to-do changes the notification, so it shows as unread again.
    await markAlerts(ex, [today.key], true);
    await createTask(ex, { title: "One more", type: "Call", dueDate: day, assigneeId: ex.id });
    const after = (await attentionAlerts(ex)).find((a) => a.key.startsWith("tasks-today:"))!;
    expect(after.key).not.toBe(today.key);
    expect(after.read).toBe(false);
    expect(await db.notificationRead.count({ where: { userId: ex.id } })).toBe(1);
  });
});
