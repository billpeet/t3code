import { createFileRoute } from "@tanstack/react-router";
import { ScheduledJobsPanel } from "../components/settings/ScheduledJobsPanel";

export const Route = createFileRoute("/settings/scheduled-jobs")({
  component: ScheduledJobsPanel,
});
