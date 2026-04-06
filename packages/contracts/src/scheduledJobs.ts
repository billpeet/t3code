import { Schema } from "effect";
import { IsoDateTime, ProjectId, TrimmedNonEmptyString, TrimmedString } from "./baseSchemas";

export const ScheduledJobTime = TrimmedNonEmptyString.check(
  Schema.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/),
);
export type ScheduledJobTime = typeof ScheduledJobTime.Type;

export const ScheduledJobWeekday = Schema.Literals([
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
]);
export type ScheduledJobWeekday = typeof ScheduledJobWeekday.Type;

export const ScheduledJobDailySchedule = Schema.Struct({
  kind: Schema.Literal("daily"),
  time: ScheduledJobTime,
});
export type ScheduledJobDailySchedule = typeof ScheduledJobDailySchedule.Type;

export const ScheduledJobWeeklySchedule = Schema.Struct({
  kind: Schema.Literal("weekly"),
  time: ScheduledJobTime,
  weekdays: Schema.Array(ScheduledJobWeekday),
});
export type ScheduledJobWeeklySchedule = typeof ScheduledJobWeeklySchedule.Type;

export const ScheduledJobSchedule = Schema.Union([
  ScheduledJobDailySchedule,
  ScheduledJobWeeklySchedule,
]);
export type ScheduledJobSchedule = typeof ScheduledJobSchedule.Type;

export const ScheduledJobId = TrimmedNonEmptyString;
export type ScheduledJobId = typeof ScheduledJobId.Type;

export const ScheduledJob = Schema.Struct({
  id: ScheduledJobId,
  name: TrimmedString.check(Schema.isMaxLength(120)),
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  projectId: ProjectId,
  baseBranch: TrimmedString.check(Schema.isMaxLength(255)),
  prompt: Schema.String.check(Schema.isMaxLength(50_000)),
  schedule: ScheduledJobSchedule,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type ScheduledJob = typeof ScheduledJob.Type;
