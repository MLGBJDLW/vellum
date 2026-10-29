import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export const REQUIRED_CI_JOBS = [
  "Lint",
  "Typecheck",
  ...["ubuntu-latest", "windows-latest", "macos-latest"].flatMap((os) =>
    ["22", "24"].map((node) => `Test (${os}, Node ${node})`)
  ),
];

class CiPendingError extends Error {}

/** The newest push run on this immutable main commit must be complete and green. */
export function selectReleaseCiRun(runs, sha) {
  const run = runs
    .filter(
      (candidate) =>
        candidate.head_sha === sha && candidate.head_branch === "main" && candidate.event === "push"
    )
    .sort(
      (left, right) => right.run_number - left.run_number || right.run_attempt - left.run_attempt
    )[0];
  if (!run) throw new CiPendingError(`No main push CI run exists for ${sha}`);
  if (run.status !== "completed")
    throw new CiPendingError(`CI run ${run.id} is ${run.status}; wait for full CI to pass`);
  if (run.conclusion !== "success") {
    throw new Error(
      `CI run ${run.id} is ${run.status}/${run.conclusion ?? "pending"}; wait for full CI to pass`
    );
  }
  return run;
}

/** A title-based quick check or skipped matrix cannot authorize publication. */
export function verifyReleaseCiJobs(jobs) {
  const missing = REQUIRED_CI_JOBS.filter(
    (name) =>
      !jobs.some(
        (job) => job.name === name && job.status === "completed" && job.conclusion === "success"
      )
  );
  if (missing.length) throw new Error(`Release requires successful CI jobs: ${missing.join(", ")}`);
}

function githubJson(endpoint, ...args) {
  return JSON.parse(
    execFileSync("gh", ["api", endpoint, ...args], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    })
  );
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const sha = process.env.RELEASE_SHA;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !sha || !/^[a-f0-9]{40}$/i.test(sha)) {
    throw new Error("GITHUB_REPOSITORY and a full RELEASE_SHA are required");
  }
  const waitSeconds = Number(process.env.CI_WAIT_SECONDS ?? 0);
  if (!Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > 2400)
    throw new Error("CI_WAIT_SECONDS must be between 0 and 2400");
  const deadline = Date.now() + waitSeconds * 1000;
  for (;;) {
    try {
      const runs = githubJson(
        `repos/${repo}/actions/workflows/ci.yml/runs`,
        "--method",
        "GET",
        "-f",
        `head_sha=${sha}`,
        "-f",
        "per_page=100"
      );
      const run = selectReleaseCiRun(runs.workflow_runs ?? [], sha);
      const pages = githubJson(
        `repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`,
        "--paginate",
        "--slurp"
      );
      verifyReleaseCiJobs(pages.flatMap((page) => page.jobs ?? []));
      console.log(`Verified full CI: ${run.html_url} (attempt ${run.run_attempt}, commit ${sha})`);
      return;
    } catch (error) {
      if (!(error instanceof CiPendingError) || Date.now() >= deadline) throw error;
      console.log(error.message);
      await delay(Math.min(30000, deadline - Date.now()));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
