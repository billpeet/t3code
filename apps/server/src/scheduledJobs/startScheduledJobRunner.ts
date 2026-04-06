import {
  CommandId,
  DEFAULT_MODEL_BY_PROVIDER,
  EventId,
  MessageId,
  type ModelSelection,
  type OrchestrationReadModel,
  type OrchestrationThread,
  ThreadId,
  type ScheduledJob,
} from "@t3tools/contracts";
import {
  buildScheduledJobThreadTitle,
  buildScheduledJobWorktreeBranchName,
  getMostRecentScheduledJobRunAt,
  getScheduledJobAttemptToken,
} from "@t3tools/shared/scheduledJobs";
import { Duration, Effect, Exit, Ref, Scope, Stream } from "effect";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery";
import { makeThreadBootstrapDispatcher } from "../orchestration/threadBootstrapDispatcher";
import { ServerSettingsService } from "../serverSettings";

const SCHEDULED_JOB_POLL_INTERVAL = Duration.seconds(30);

function scheduledSlotIso(slotAt: Date): string {
  return slotAt.toISOString();
}

function makeScheduledThreadId(jobId: string, slotAt: Date): ThreadId {
  return ThreadId.makeUnsafe(`scheduled:${jobId}:${scheduledSlotIso(slotAt)}:thread`);
}

function makeScheduledMessageId(jobId: string, slotAt: Date): MessageId {
  return MessageId.makeUnsafe(`scheduled:${jobId}:${scheduledSlotIso(slotAt)}:message`);
}

function makeScheduledCommandId(jobId: string, slotAt: Date, step: string): CommandId {
  return CommandId.makeUnsafe(`scheduled:${jobId}:${scheduledSlotIso(slotAt)}:${step}`);
}

function findActiveThread(
  snapshot: OrchestrationReadModel,
  threadId: ThreadId,
): OrchestrationThread | undefined {
  return snapshot.threads.find((thread) => thread.id === threadId && thread.deletedAt === null);
}

function resolveScheduledJobModelSelection(input: {
  readonly existingThread: OrchestrationThread | undefined;
  readonly projectDefaultModelSelection: ModelSelection | null;
}): ModelSelection {
  if (input.existingThread) {
    return input.existingThread.modelSelection;
  }
  return (
    input.projectDefaultModelSelection ?? {
      provider: "codex",
      model: DEFAULT_MODEL_BY_PROVIDER.codex,
    }
  );
}

function isRunnableScheduledJob(job: ScheduledJob): boolean {
  return (
    job.name.trim().length > 0 &&
    job.baseBranch.trim().length > 0 &&
    job.prompt.trim().length > 0 &&
    (job.schedule.kind !== "weekly" || job.schedule.weekdays.length > 0)
  );
}

export const startScheduledJobRunner = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const serverSettings = yield* ServerSettingsService;
  const threadBootstrapDispatcher = yield* makeThreadBootstrapDispatcher;
  const lastAttemptTokenByJobIdRef = yield* Ref.make<Record<string, string>>({});
  const runnerScope = yield* Scope.make("sequential");

  yield* Effect.addFinalizer(() => Scope.close(runnerScope, Exit.void));

  const appendScheduledJobFailureActivity = (input: {
    readonly job: ScheduledJob;
    readonly slotAt: Date;
    readonly threadId: ThreadId;
    readonly detail: string;
  }) =>
    orchestrationEngine
      .dispatch({
        type: "thread.activity.append",
        commandId: makeScheduledCommandId(input.job.id, input.slotAt, "bootstrap-failure"),
        threadId: input.threadId,
        activity: {
          id: EventId.makeUnsafe(
            `scheduled:${input.job.id}:${scheduledSlotIso(input.slotAt)}:bootstrap-failure`,
          ),
          tone: "error",
          kind: "scheduled-job.failed",
          summary: "Scheduled job failed before the run started",
          payload: {
            jobId: input.job.id,
            jobName: input.job.name,
            scheduledFor: input.slotAt.toISOString(),
            detail: input.detail,
          },
          turnId: null,
          createdAt: input.slotAt.toISOString(),
        },
        createdAt: input.slotAt.toISOString(),
      })
      .pipe(Effect.ignoreCause({ log: true }));

  const dispatchScheduledJob = (input: {
    readonly job: ScheduledJob;
    readonly slotAt: Date;
    readonly snapshot: OrchestrationReadModel;
  }) =>
    Effect.gen(function* () {
      const project = input.snapshot.projects.find(
        (entry) => entry.id === input.job.projectId && entry.deletedAt === null,
      );
      if (!project) {
        yield* Effect.logWarning("scheduled job skipped because its project no longer exists", {
          jobId: input.job.id,
          jobName: input.job.name,
          projectId: input.job.projectId,
        });
        return;
      }

      const threadId = makeScheduledThreadId(input.job.id, input.slotAt);
      const existingThread = findActiveThread(input.snapshot, threadId);
      const modelSelection = resolveScheduledJobModelSelection({
        existingThread,
        projectDefaultModelSelection: project.defaultModelSelection,
      });
      const slotIso = input.slotAt.toISOString();

      const baseCommand = {
        type: "thread.turn.start" as const,
        commandId: makeScheduledCommandId(input.job.id, input.slotAt, "turn-start"),
        threadId,
        message: {
          messageId: makeScheduledMessageId(input.job.id, input.slotAt),
          role: "user" as const,
          text: input.job.prompt,
          attachments: [],
        },
        modelSelection,
        runtimeMode: "full-access" as const,
        interactionMode: "default" as const,
        titleSeed: input.job.name,
        createdAt: slotIso,
      };

      const command =
        existingThread && existingThread.worktreePath !== null
          ? baseCommand
          : {
              ...baseCommand,
              bootstrap: {
                ...(existingThread
                  ? {}
                  : {
                      createThread: {
                        projectId: input.job.projectId,
                        title: buildScheduledJobThreadTitle(input.job.name, input.slotAt),
                        modelSelection,
                        runtimeMode: "full-access" as const,
                        interactionMode: "default" as const,
                        branch: null,
                        worktreePath: null,
                        createdAt: slotIso,
                      },
                    }),
                prepareWorktree: {
                  projectCwd: project.workspaceRoot,
                  baseBranch: input.job.baseBranch,
                  branch: buildScheduledJobWorktreeBranchName(input.job.name, input.slotAt),
                },
                runSetupScript: true,
              },
            };

      yield* threadBootstrapDispatcher
        .dispatch(command, {
          cleanupCreatedThreadOnFailure: false,
          commandIdFactory: (step) => makeScheduledCommandId(input.job.id, input.slotAt, step),
        })
        .pipe(
          Effect.tap(() =>
            Effect.logInfo("scheduled job dispatched", {
              jobId: input.job.id,
              jobName: input.job.name,
              projectId: input.job.projectId,
              threadId,
              scheduledFor: slotIso,
            }),
          ),
          Effect.catch((error) => {
            const detail = error instanceof Error ? error.message : "Unknown scheduled job error.";
            return Effect.all([
              appendScheduledJobFailureActivity({
                job: input.job,
                slotAt: input.slotAt,
                threadId,
                detail,
              }),
              Effect.logWarning("scheduled job dispatch failed", {
                jobId: input.job.id,
                jobName: input.job.name,
                projectId: input.job.projectId,
                threadId,
                scheduledFor: slotIso,
                detail,
              }),
            ]).pipe(Effect.asVoid);
          }),
        );
    });

  const tick = Effect.gen(function* () {
    const settings = yield* serverSettings.getSettings;
    const jobs = settings.scheduledJobs.filter((job) => job.enabled);
    if (jobs.length === 0) {
      return;
    }

    const snapshot = yield* projectionSnapshotQuery.getSnapshot().pipe(
      Effect.catch((error) =>
        Effect.logWarning("scheduled job runner could not load the projection snapshot", {
          detail: error.message,
        }).pipe(Effect.as(null)),
      ),
    );
    if (snapshot === null) {
      return;
    }

    const now = new Date();
    const lastAttemptTokens = yield* Ref.get(lastAttemptTokenByJobIdRef);
    const nextAttemptTokens = { ...lastAttemptTokens };

    for (const job of jobs) {
      if (!isRunnableScheduledJob(job)) {
        continue;
      }
      const slotAt = getMostRecentScheduledJobRunAt(job.schedule, now);
      if (slotAt.getTime() < new Date(job.createdAt).getTime()) {
        continue;
      }

      const attemptToken = getScheduledJobAttemptToken(job, slotAt);
      if (lastAttemptTokens[job.id] === attemptToken) {
        continue;
      }

      nextAttemptTokens[job.id] = attemptToken;
      yield* dispatchScheduledJob({
        job,
        slotAt,
        snapshot,
      });
    }

    yield* Ref.set(lastAttemptTokenByJobIdRef, nextAttemptTokens);
  });

  const triggerTick = tick.pipe(Effect.ignoreCause({ log: true }));

  yield* triggerTick;
  yield* Effect.sleep(SCHEDULED_JOB_POLL_INTERVAL).pipe(
    Effect.andThen(triggerTick),
    Effect.forever,
    Effect.forkIn(runnerScope),
    Effect.asVoid,
  );
  yield* Stream.runForEach(serverSettings.streamChanges, () => triggerTick).pipe(
    Effect.ignoreCause({ log: true }),
    Effect.forkIn(runnerScope),
    Effect.asVoid,
  );
});
