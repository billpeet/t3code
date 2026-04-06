#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function fail(message, details) {
  console.error(`[sync:upstream] ${message}`);
  if (details) {
    console.error(details);
  }
  process.exit(1);
}

function run(command, args, options = {}) {
  const printable = [command, ...args].join(" ");
  console.log(`[sync:upstream] ${printable}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    encoding: "utf8",
    ...options,
  });

  if (result.error) {
    fail(`Failed to run '${printable}'.`, result.error.message);
  }
  if (result.status !== 0) {
    fail(`Command exited with status ${result.status}: ${printable}`);
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });

  if (result.error) {
    fail(`Failed to run '${command} ${args.join(" ")}'.`, result.error.message);
  }
  if (result.status !== 0) {
    fail(
      `Command exited with status ${result.status}: ${command} ${args.join(" ")}`,
      result.stderr.trim(),
    );
  }

  return result.stdout.trim();
}

const args = new Set(process.argv.slice(2));
const remoteArg = process.argv.find((arg) => arg.startsWith("--remote="));
const branchArg = process.argv.find((arg) => arg.startsWith("--branch="));
const upstreamBranchArg = process.argv.find((arg) => arg.startsWith("--upstream-branch="));
const remote = remoteArg ? remoteArg.slice("--remote=".length) : "upstream";
const shouldPush = !args.has("--no-push");
const useRebase = args.has("--rebase");

capture("git", ["rev-parse", "--show-toplevel"]);

const currentBranch = capture("git", ["branch", "--show-current"]);
const branch = branchArg ? branchArg.slice("--branch=".length) : currentBranch;
const upstreamBranch = upstreamBranchArg
  ? upstreamBranchArg.slice("--upstream-branch=".length)
  : "main";
const upstreamRef = `${remote}/${upstreamBranch}`;

const status = capture("git", ["status", "--porcelain"]);
if (status.length > 0) {
  fail("Working tree is not clean. Commit or stash changes before syncing upstream.");
}

const remoteUrl = capture("git", ["remote", "get-url", remote]);
const originUrl = capture("git", ["remote", "get-url", "origin"]);
console.log(`[sync:upstream] origin=${originUrl}`);
console.log(`[sync:upstream] ${remote}=${remoteUrl}`);

run("git", ["fetch", remote, "--tags", "--prune"]);

if (currentBranch !== branch) {
  run("git", ["checkout", branch]);
}

if (useRebase) {
  run("git", ["rebase", upstreamRef]);
} else {
  run("git", ["merge", "--no-edit", upstreamRef]);
}

if (shouldPush) {
  run("git", ["push", "origin", branch]);
} else {
  console.log("[sync:upstream] Skipping push because --no-push was provided.");
}

console.log(`[sync:upstream] ${branch} is now synced with ${upstreamRef}.`);
