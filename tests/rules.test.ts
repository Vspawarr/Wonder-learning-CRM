import { describe, expect, it } from "vitest";
import { STAGES, STAGE_PROBABILITY } from "@/lib/constants";
import { addDays, daysFrom, fmtDate, todayIST } from "@/lib/dates";
import { canManageSettings, seesAllSales } from "@/lib/permissions";
import { planStageMove } from "@/server/rules";
import { leadInput, parse, stageMoveInput } from "@/server/validation";

describe("stage rules", () => {
  it("sets the probability from the stage table", () => {
    for (const s of STAGES.filter((s) => s !== "INTERESTED"))
      expect(planStageMove("INTERESTED", s, "X").probability).toBe(STAGE_PROBABILITY[s]);
    expect(STAGE_PROBABILITY).toMatchObject({ INTERESTED: 20, DEMO_SCHEDULED: 35, PROPOSAL_SENT: 55, NEGOTIATION: 75, WON: 100, LOST: 0 });
  });
  it("won and lost are final", () => {
    expect(() => planStageMove("WON", "NEGOTIATION", "X")).toThrow(/Closed deals/);
    expect(() => planStageMove("LOST", "INTERESTED", "X")).toThrow(/Closed deals/);
  });
  it("creates a follow-up task only for proposal sent and negotiation", () => {
    expect(planStageMove("INTERESTED", "PROPOSAL_SENT", "A").autoTask).toMatch(/proposal sent: A/);
    expect(planStageMove("PROPOSAL_SENT", "NEGOTIATION", "A").autoTask).toMatch(/negotiation: A/);
    expect(planStageMove("INTERESTED", "DEMO_SCHEDULED", "A").autoTask).toBeNull();
  });
  it("lost needs a reason and remarks", () => {
    expect(() => parse(stageMoveInput, { stage: "LOST" })).toThrow(/reason/);
    expect(() => parse(stageMoveInput, { stage: "LOST", lostReason: "No Budget" })).toThrow(/Remarks/);
    expect(() => parse(stageMoveInput, { stage: "LOST", lostReason: "Made up", lostRemarks: "x" })).toThrow(/reason/);
    expect(parse(stageMoveInput, { stage: "LOST", lostReason: "No Budget", lostRemarks: "x" }).stage).toBe("LOST");
  });
});

describe("lead validation", () => {
  const base = {
    schoolName: "A",
    contactName: "B",
    mobile: "9876543210",
    state: "Goa",
    city: "Panaji",
    source: "Website",
    assignedToId: "u",
    nextFollowUpDate: "2026-10-05",
  };
  it("accepts the required fields", () => expect(parse(leadInput, base).status).toBe("NEW"));
  it.each([
    ["schoolName", "", /School name/],
    ["mobile", "123", /mobile/],
    ["source", "Twitter", /lead source/],
    ["nextFollowUpDate", "", /follow-up date/],
    ["email", "nope", /email/],
  ])("rejects bad %s", (k, v, msg) => expect(() => parse(leadInput, { ...base, [k]: v })).toThrow(msg));
  it("does not allow Converted/Disqualified to be set by hand", () =>
    expect(() => parse(leadInput, { ...base, status: "CONVERTED" })).toThrow());
});

describe("roles", () => {
  it("managers and executives are limited to their own data", () => {
    expect(seesAllSales("SALES_EXECUTIVE")).toBe(false);
    expect(seesAllSales("SALES_MANAGER")).toBe(false);
    for (const r of ["DIRECTOR", "ADMIN", "SALES_HEAD"] as const) expect(seesAllSales(r)).toBe(true);
  });
  it("only directors and admins manage settings", () => {
    expect(canManageSettings("ADMIN")).toBe(true);
    expect(canManageSettings("DIRECTOR")).toBe(true);
    expect(canManageSettings("SALES_HEAD")).toBe(false);
  });
});

describe("dates", () => {
  it("does day arithmetic on calendar strings", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysFrom("2026-10-01", "2026-09-30")).toBe(1);
    expect(fmtDate("2026-10-05", "2026-01-01")).toBe("5 Oct");
    expect(fmtDate("2027-01-05", "2026-01-01")).toBe("5 Jan '27");
  });
  it("uses India time for today", () => {
    expect(todayIST(new Date("2026-09-30T19:00:00Z"))).toBe("2026-10-01");
  });
});

describe("lead category", () => {
  it("a blank category is fine unless the lead is Qualified", () => {
    const base = { schoolName: "A", contactName: "B", mobile: "9876543210", state: "Goa", city: "Panaji", source: "Website", assignedToId: "u", nextFollowUpDate: "2026-10-05" };
    expect(parse(leadInput, { ...base, temperature: "" }).temperature).toBeNull();
    expect(() => parse(leadInput, { ...base, temperature: "", status: "QUALIFIED" })).toThrow(/category/);
  });
});
