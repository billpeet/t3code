import { Clock3Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { type ScheduledJob, type ScheduledJobWeekday } from "@t3tools/contracts";
import {
  describeScheduledJobSchedule,
  getNextScheduledJobRunAt,
} from "@t3tools/shared/scheduledJobs";
import { useMemo } from "react";
import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { useStore } from "../../store";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { SettingsPageContainer, SettingsSection } from "./SettingsLayout";
import { cn } from "../../lib/utils";

const WEEKDAYS: ReadonlyArray<{ value: ScheduledJobWeekday; label: string }> = [
  { value: "mon", label: "Mon" },
  { value: "tue", label: "Tue" },
  { value: "wed", label: "Wed" },
  { value: "thu", label: "Thu" },
  { value: "fri", label: "Fri" },
  { value: "sat", label: "Sat" },
  { value: "sun", label: "Sun" },
];

function formatNextRun(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function createDefaultScheduledJob(projectId: string): ScheduledJob {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "Scheduled review",
    enabled: true,
    projectId: projectId as ScheduledJob["projectId"],
    baseBranch: "main",
    prompt:
      "Review the project status, make any needed updates, and report the outcome in this thread.",
    schedule: {
      kind: "daily",
      time: "09:00",
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function ScheduledJobsPanel() {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const projects = useStore((store) => store.projects);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const projectOptions = useMemo(
    () =>
      projects
        .map((project) => ({
          value: project.id,
          label: project.name,
          detail: project.cwd,
        }))
        .toSorted((left, right) => left.label.localeCompare(right.label)),
    [projects],
  );

  const replaceJob = (jobId: string, updater: (job: ScheduledJob) => ScheduledJob) => {
    const updatedAt = new Date().toISOString();
    updateSettings({
      scheduledJobs: settings.scheduledJobs.map((job) =>
        job.id === jobId ? { ...updater(job), updatedAt } : job,
      ),
    });
  };

  const removeJob = (jobId: string) => {
    updateSettings({
      scheduledJobs: settings.scheduledJobs.filter((job) => job.id !== jobId),
    });
  };

  const addJob = () => {
    const firstProjectId = projectOptions[0]?.value;
    if (!firstProjectId) {
      return;
    }
    updateSettings({
      scheduledJobs: [...settings.scheduledJobs, createDefaultScheduledJob(firstProjectId)],
    });
  };

  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Scheduled jobs"
        icon={<Clock3Icon className="size-3.5" />}
        headerAction={
          <Button
            size="xs"
            variant="outline"
            disabled={projectOptions.length === 0}
            onClick={addJob}
          >
            <PlusIcon className="size-3.5" />
            Add job
          </Button>
        }
      >
        <div className="border-b border-border/60 px-4 py-4 sm:px-5">
          <p className="text-sm text-foreground">
            Each job creates a fresh thread, prepares a new worktree from the configured base
            branch, and runs the saved prompt end to end.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Runs use the project&apos;s default model, full-access runtime, and your local timezone
            {timezone ? ` (${timezone})` : ""}.
          </p>
        </div>

        {projectOptions.length === 0 ? (
          <Empty className="min-h-72">
            <EmptyMedia variant="icon">
              <Clock3Icon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Add a project first</EmptyTitle>
              <EmptyDescription>
                Scheduled jobs need a project target before they can be configured.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : settings.scheduledJobs.length === 0 ? (
          <Empty className="min-h-72">
            <EmptyMedia variant="icon">
              <Clock3Icon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No scheduled jobs yet</EmptyTitle>
              <EmptyDescription>
                Create a recurring task for a project and T3 Code will open a new worktree-backed
                thread on schedule.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="divide-y divide-border/60">
            {settings.scheduledJobs.map((job) => {
              const selectedProject = projectOptions.find(
                (project) => project.value === job.projectId,
              );
              const nextRun = getNextScheduledJobRunAt(job.schedule, new Date());
              const selectedWeekdays =
                job.schedule.kind === "weekly" ? new Set(job.schedule.weekdays) : new Set<string>();
              const jobLabel = job.name.trim() || "Untitled job";

              return (
                <article key={job.id} className="space-y-4 px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-sm font-medium text-foreground">{jobLabel}</h3>
                        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          {job.enabled ? "Enabled" : "Paused"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {describeScheduledJobSchedule(job.schedule)}
                        {" · Next run "}
                        <span className="text-foreground">{formatNextRun(nextRun)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={job.enabled}
                        aria-label={`Enable ${jobLabel}`}
                        onCheckedChange={(checked) =>
                          replaceJob(job.id, (current) => ({
                            ...current,
                            enabled: Boolean(checked),
                          }))
                        }
                      />
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Delete ${jobLabel}`}
                        onClick={() => removeJob(job.id)}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                    <div className="space-y-4">
                      <label className="block">
                        <span className="text-xs font-medium text-foreground">Job name</span>
                        <Input
                          className="mt-1.5"
                          value={job.name}
                          onChange={(event) =>
                            replaceJob(job.id, (current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                          placeholder="Nightly dependency sweep"
                          spellCheck={false}
                        />
                      </label>

                      <label className="block">
                        <span className="text-xs font-medium text-foreground">Prompt</span>
                        <Textarea
                          className="mt-1.5"
                          value={job.prompt}
                          onChange={(event) =>
                            replaceJob(job.id, (current) => ({
                              ...current,
                              prompt: event.target.value,
                            }))
                          }
                          placeholder="Describe the work this job should carry out."
                          rows={6}
                        />
                      </label>
                    </div>

                    <div className="space-y-4">
                      <label className="block">
                        <span className="text-xs font-medium text-foreground">Project</span>
                        <Select
                          value={job.projectId}
                          onValueChange={(value) =>
                            replaceJob(job.id, (current) => ({
                              ...current,
                              projectId: value as ScheduledJob["projectId"],
                            }))
                          }
                        >
                          <SelectTrigger className="mt-1.5 w-full justify-between">
                            <SelectValue placeholder="Select a project" />
                          </SelectTrigger>
                          <SelectPopup>
                            {selectedProject === undefined ? (
                              <SelectItem hideIndicator value={job.projectId}>
                                Missing project
                              </SelectItem>
                            ) : null}
                            {projectOptions.map((project) => (
                              <SelectItem key={project.value} hideIndicator value={project.value}>
                                {project.label}
                              </SelectItem>
                            ))}
                          </SelectPopup>
                        </Select>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">
                          {selectedProject?.detail ?? "This project is no longer available."}
                        </span>
                      </label>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="text-xs font-medium text-foreground">Frequency</span>
                          <Select
                            value={job.schedule.kind}
                            onValueChange={(value) =>
                              replaceJob(job.id, (current) => ({
                                ...current,
                                schedule:
                                  value === "weekly"
                                    ? {
                                        kind: "weekly",
                                        time: current.schedule.time,
                                        weekdays: ["mon"],
                                      }
                                    : { kind: "daily", time: current.schedule.time },
                              }))
                            }
                          >
                            <SelectTrigger className="mt-1.5 w-full justify-between">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectPopup>
                              <SelectItem hideIndicator value="daily">
                                Daily
                              </SelectItem>
                              <SelectItem hideIndicator value="weekly">
                                Weekly
                              </SelectItem>
                            </SelectPopup>
                          </Select>
                        </label>

                        <label className="block">
                          <span className="text-xs font-medium text-foreground">Time</span>
                          <Input
                            nativeInput
                            className="mt-1.5"
                            type="time"
                            value={job.schedule.time}
                            onChange={(event) =>
                              replaceJob(job.id, (current) => ({
                                ...current,
                                schedule: {
                                  ...current.schedule,
                                  time: event.target.value || "09:00",
                                },
                              }))
                            }
                          />
                        </label>
                      </div>

                      {job.schedule.kind === "weekly" ? (
                        <div>
                          <span className="text-xs font-medium text-foreground">Days</span>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {WEEKDAYS.map((weekday) => {
                              const selected = selectedWeekdays.has(weekday.value);
                              return (
                                <button
                                  key={weekday.value}
                                  type="button"
                                  className={cn(
                                    "inline-flex h-8 min-w-11 items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors",
                                    selected
                                      ? "border-foreground/15 bg-foreground text-background"
                                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                                  )}
                                  onClick={() =>
                                    replaceJob(job.id, (current) => {
                                      if (current.schedule.kind !== "weekly") {
                                        return current;
                                      }
                                      const nextWeekdays = current.schedule.weekdays.includes(
                                        weekday.value,
                                      )
                                        ? current.schedule.weekdays.filter(
                                            (value) => value !== weekday.value,
                                          )
                                        : [...current.schedule.weekdays, weekday.value];
                                      return {
                                        ...current,
                                        schedule: {
                                          ...current.schedule,
                                          weekdays:
                                            nextWeekdays.length > 0
                                              ? nextWeekdays
                                              : current.schedule.weekdays,
                                        },
                                      };
                                    })
                                  }
                                >
                                  {weekday.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}

                      <label className="block">
                        <span className="text-xs font-medium text-foreground">Base branch</span>
                        <Input
                          className="mt-1.5"
                          value={job.baseBranch}
                          onChange={(event) =>
                            replaceJob(job.id, (current) => ({
                              ...current,
                              baseBranch: event.target.value,
                            }))
                          }
                          placeholder="main"
                          spellCheck={false}
                        />
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Each run branches from this ref before the new worktree is created.
                        </span>
                      </label>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
