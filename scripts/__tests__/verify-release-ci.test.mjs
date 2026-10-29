import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_CI_JOBS,
  selectReleaseCiRun,
  verifyReleaseCiJobs,
} from "../verify-release-ci.mjs";

const sha = "a".repeat(40);
const run = {
  id: 42,
  head_sha: sha,
  head_branch: "main",
  event: "push",
  run_number: 10,
  run_attempt: 1,
  status: "completed",
  conclusion: "success",
};
const jobs = REQUIRED_CI_JOBS.map((name) => ({ name, status: "completed", conclusion: "success" }));

test("accepts the full CI matrix for the exact main commit", () => {
  assert.equal(selectReleaseCiRun([run], sha).id, 42);
  assert.doesNotThrow(() => verifyReleaseCiJobs(jobs));
});

test("does not reuse a different commit, PR, or non-main run", () => {
  for (const changed of [
    { head_sha: "b".repeat(40) },
    { event: "pull_request" },
    { head_branch: "feature" },
  ]) {
    assert.throws(() => selectReleaseCiRun([{ ...run, ...changed }], sha), /No main push CI/);
  }
});

test("a newer failed or pending run cannot fall back to an older green run", () => {
  for (const changed of [
    { status: "in_progress", conclusion: null },
    { status: "completed", conclusion: "failure" },
  ]) {
    assert.throws(
      () => selectReleaseCiRun([run, { ...run, id: 43, run_number: 11, ...changed }], sha),
      /wait for full CI/
    );
  }
});

test("quick-only CI and skipped or failed jobs cannot authorize a release", () => {
  assert.throws(
    () =>
      verifyReleaseCiJobs([
        { name: "Quick Check (Version PR)", status: "completed", conclusion: "success" },
      ]),
    /Release requires/
  );
  for (const conclusion of ["skipped", "failure", "cancelled"]) {
    assert.throws(
      () =>
        verifyReleaseCiJobs(jobs.map((job, index) => (index === 0 ? { ...job, conclusion } : job))),
      /Lint/
    );
  }
});

test("all six OS and Node combinations are required", () => {
  for (const removed of jobs)
    assert.throws(
      () => verifyReleaseCiJobs(jobs.filter((job) => job !== removed)),
      /Release requires/
    );
});
