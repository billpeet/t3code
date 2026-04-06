import { describe, expect, it } from "vitest";
import {
  buildScheduledJobThreadTitle,
  buildScheduledJobWorktreeBranchName,
  describeScheduledJobSchedule,
  getMostRecentScheduledJobRunAt,
  getNextScheduledJobRunAt,
} from "./scheduledJobs";

describe("scheduledJobs", () => {
  it("describes daily schedules", () => {
    expect(
      describeScheduledJobSchedule({
        kind: "daily",
        time: "09:30",
      }),
    ).toBe("Every day at 9:30 AM");
  });

  it("describes weekday weekly schedules compactly", () => {
    expect(
      describeScheduledJobSchedule({
        kind: "weekly",
        time: "18:00",
        weekdays: ["mon", "tue", "wed", "thu", "fri"],
      }),
    ).toBe("Every weekday at 6:00 PM");
  });

  it("computes the next daily run", () => {
    const next = getNextScheduledJobRunAt(
      {
        kind: "daily",
        time: "09:30",
      },
      new Date(2026, 3, 6, 8, 0, 0, 0),
    );

    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(3);
    expect(next.getDate()).toBe(6);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(30);
  });

  it("computes the most recent weekly run", () => {
    const latest = getMostRecentScheduledJobRunAt(
      {
        kind: "weekly",
        time: "09:30",
        weekdays: ["mon", "wed"],
      },
      new Date(2026, 3, 9, 8, 0, 0, 0),
    );

    expect(latest.getFullYear()).toBe(2026);
    expect(latest.getMonth()).toBe(3);
    expect(latest.getDate()).toBe(8);
    expect(latest.getHours()).toBe(9);
    expect(latest.getMinutes()).toBe(30);
  });

  it("builds deterministic titles and worktree branches", () => {
    const slotAt = new Date(2026, 3, 6, 9, 30, 0, 0);
    expect(buildScheduledJobThreadTitle("Morning sync", slotAt)).toBe(
      "Morning sync · 2026-04-06 09:30",
    );
    expect(buildScheduledJobWorktreeBranchName("Morning sync", slotAt)).toBe(
      "t3code/scheduled/morning-sync-20260406-0930",
    );
  });
});
