import {
  type ScheduledJob,
  type ScheduledJobSchedule,
  type ScheduledJobTime,
  type ScheduledJobWeekday,
} from "@t3tools/contracts";

const WEEKDAY_ORDER: readonly ScheduledJobWeekday[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

const WEEKDAY_LABEL: Record<ScheduledJobWeekday, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

interface TimeParts {
  readonly hour: number;
  readonly minute: number;
}

function parseScheduledJobTime(time: ScheduledJobTime): TimeParts {
  const [hour = "0", minute = "0"] = time.split(":");
  return {
    hour: Number.parseInt(hour, 10),
    minute: Number.parseInt(minute, 10),
  };
}

function startOfLocalMinute(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    0,
    0,
  );
}

function withScheduledTime(date: Date, time: ScheduledJobTime): Date {
  const { hour, minute } = parseScheduledJobTime(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - days);
}

function normalizeWeekdays(weekdays: ReadonlyArray<ScheduledJobWeekday>): ScheduledJobWeekday[] {
  const unique = new Set(weekdays);
  return WEEKDAY_ORDER.filter((weekday) => unique.has(weekday));
}

function dayToIndex(weekday: ScheduledJobWeekday): number {
  return WEEKDAY_ORDER.indexOf(weekday);
}

function formatScheduleTime(time: ScheduledJobTime): string {
  const [hourRaw = "00", minuteRaw = "00"] = time.split(":");
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  const meridiem = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${meridiem}`;
}

export function describeScheduledJobSchedule(schedule: ScheduledJobSchedule): string {
  if (schedule.kind === "daily") {
    return `Every day at ${formatScheduleTime(schedule.time)}`;
  }

  const weekdays = normalizeWeekdays(schedule.weekdays);
  const weekdayLabel =
    weekdays.length === 5 &&
    weekdays.every((weekday, index) => weekday === WEEKDAY_ORDER[index + 1])
      ? "weekday"
      : weekdays.map((weekday) => WEEKDAY_LABEL[weekday]).join(", ");
  return `Every ${weekdayLabel} at ${formatScheduleTime(schedule.time)}`;
}

export function getNextScheduledJobRunAt(
  schedule: ScheduledJobSchedule,
  referenceDate: Date,
): Date {
  const referenceMinute = startOfLocalMinute(referenceDate);
  if (schedule.kind === "daily") {
    const today = withScheduledTime(referenceMinute, schedule.time);
    if (today > referenceMinute) {
      return today;
    }
    return withScheduledTime(subtractDays(referenceMinute, -1), schedule.time);
  }

  const weekdays = normalizeWeekdays(schedule.weekdays);
  for (let offset = 0; offset < 8; offset += 1) {
    const candidateDay = subtractDays(referenceMinute, -offset);
    if (!weekdays.some((weekday) => dayToIndex(weekday) === candidateDay.getDay())) {
      continue;
    }
    const candidate = withScheduledTime(candidateDay, schedule.time);
    if (candidate > referenceMinute) {
      return candidate;
    }
  }

  return withScheduledTime(subtractDays(referenceMinute, -7), schedule.time);
}

export function getMostRecentScheduledJobRunAt(
  schedule: ScheduledJobSchedule,
  referenceDate: Date,
): Date {
  const referenceMinute = startOfLocalMinute(referenceDate);
  if (schedule.kind === "daily") {
    const today = withScheduledTime(referenceMinute, schedule.time);
    if (today <= referenceMinute) {
      return today;
    }
    return withScheduledTime(subtractDays(referenceMinute, 1), schedule.time);
  }

  const weekdays = normalizeWeekdays(schedule.weekdays);
  for (let offset = 0; offset < 8; offset += 1) {
    const candidateDay = subtractDays(referenceMinute, offset);
    if (!weekdays.some((weekday) => dayToIndex(weekday) === candidateDay.getDay())) {
      continue;
    }
    const candidate = withScheduledTime(candidateDay, schedule.time);
    if (candidate <= referenceMinute) {
      return candidate;
    }
  }

  return withScheduledTime(subtractDays(referenceMinute, 7), schedule.time);
}

export function getScheduledJobAttemptToken(
  job: Pick<ScheduledJob, "updatedAt">,
  slotAt: Date,
): string {
  return `${job.updatedAt}:${slotAt.toISOString()}`;
}

export function buildScheduledJobThreadTitle(jobName: string, slotAt: Date): string {
  const yyyy = slotAt.getFullYear();
  const mm = `${slotAt.getMonth() + 1}`.padStart(2, "0");
  const dd = `${slotAt.getDate()}`.padStart(2, "0");
  const hh = `${slotAt.getHours()}`.padStart(2, "0");
  const min = `${slotAt.getMinutes()}`.padStart(2, "0");
  return `${jobName} · ${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function buildScheduledJobWorktreeBranchName(jobName: string, slotAt: Date): string {
  const slug = jobName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const yyyy = slotAt.getFullYear();
  const mm = `${slotAt.getMonth() + 1}`.padStart(2, "0");
  const dd = `${slotAt.getDate()}`.padStart(2, "0");
  const hh = `${slotAt.getHours()}`.padStart(2, "0");
  const min = `${slotAt.getMinutes()}`.padStart(2, "0");
  return `t3code/scheduled/${slug || "job"}-${yyyy}${mm}${dd}-${hh}${min}`;
}
