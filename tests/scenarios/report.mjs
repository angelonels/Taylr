import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { evidenceFingerprint } from "../evidence.mjs";

// Failure scenarios authored before report aggregation:
// - A targeted valid rerun must supplement unchanged valid baseline contracts.
// - A newer failure must supersede an older pass; aggregation must not cherry-pick.
// - A stale or incompatible record must not qualify over a current record.
// - Headed and headless roots must never silently mix.
// - Every chosen row must identify its source and link to that original evidence.
export async function runReportScenarios(directory, environment) {
  directory = resolve(directory);
  const site = JSON.parse(await readFile("tests/sites.json", "utf8")).find(
    (site) => site.id === "youtube",
  );
  const cases = site.components.slice(0, 2);
  const base = join(directory, "baseline");
  const update = join(directory, "targeted");
  const mode = environment.mode;
  const otherMode = mode === "headed" ? "headless" : "headed";
  async function manifest(root, browserMode = mode, selected = cases) {
    await mkdir(join(root, "session-results"), { recursive: true });
    await writeFile(
      join(root, "run.json"),
      JSON.stringify({
        id: root,
        scope: "catalog",
        browserMode,
        purpose:
          "Report CLI fixture only; does not establish website compatibility",
        filters: {
          cases: selected
            .map((component) => `${site.id}:${component.id}`)
            .join(","),
        },
      }),
    );
  }
  async function record(root, component, outcome, completedAt, overrides = {}) {
    await writeFile(
      join(root, "session-results", `${site.id}--${component.id}.json`),
      JSON.stringify({
        site: site.id,
        browser: "disposable-playwright-chromium",
        environment,
        fingerprint: evidenceFingerprint(site, component),
        completedAt,
        passed: outcome === "passed",
        outcome,
        checks:
          outcome === "passed"
            ? ["H01", "H02", "H03", "H04", "H05", "H06"]
            : ["H01"],
        ...overrides,
      }),
    );
    const artifact = join(root, "sites", site.id, component.id);
    await mkdir(artifact, { recursive: true });
    await writeFile(
      join(artifact, "checks.json"),
      JSON.stringify({ fixture: true, outcome }),
    );
  }
  async function report(name) {
    const output = join(directory, name);
    const result = await promisify(execFile)(
      process.execPath,
      ["scripts/report-sites.mjs", "--roots", base, update, "--output", output],
      {
        env: {
          ...process.env,
          TAYLR_RUN_ROOT: output,
          TAYLR_SITES: "",
          TAYLR_COMPONENTS: "",
          TAYLR_CASES: "",
        },
      },
    )
      .then((result) => ({ code: 0, ...result }))
      .catch((error) => ({
        code: error.code,
        stdout: error.stdout,
        stderr: error.stderr,
      }));
    return {
      ...result,
      output,
      catalog: await readFile(join(output, "catalog-results.json"), "utf8")
        .then(JSON.parse)
        .catch(() => null),
    };
  }
  await manifest(base);
  await manifest(update, mode, [cases[0]]);
  await record(base, cases[0], "product-failed", "2026-10-22T00:00:00Z");
  await record(base, cases[1], "passed", "2026-10-22T00:00:00Z");
  await record(update, cases[0], "passed", "2026-10-22T01:00:00Z");
  let result = await report("supplement");
  assert.equal(result.code, 0);
  assert.equal(
    result.catalog?.counts.passed,
    2,
    "targeted current evidence must supplement the unchanged baseline",
  );
  const chosen = result.catalog.rows.find(
    (row) => row.id === site.id && row.caseId === cases[0].id,
  );
  assert.equal(chosen.sourceRoot, update);
  await readFile(resolve(result.output, chosen.evidence, "checks.json"));

  await record(base, cases[0], "passed", "2026-10-22T00:00:00Z");
  await record(update, cases[0], "product-failed", "2026-10-22T01:00:00Z");
  result = await report("newer-failure");
  assert.equal(result.code, 1);
  assert.equal(
    result.catalog.rows.find(
      (row) => row.id === site.id && row.caseId === cases[0].id,
    ).status,
    "product-failed",
  );

  await record(update, cases[0], "blocked", "2026-10-22T01:00:00Z");
  result = await report("newer-block");
  assert.equal(result.code, 2);
  assert.equal(result.catalog.counts.blocked, 1);

  await writeFile(
    join(update, "session-results", `${site.id}--${cases[0].id}.json`),
    "{broken",
  );
  result = await report("malformed-record");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /JSON|candidate|malformed/i);

  await record(base, cases[0], "product-failed", "2026-10-22T00:00:00Z");
  await record(update, cases[0], "passed", "2026-10-22T01:00:00Z", {
    fingerprint: "obsolete",
  });
  result = await report("stale-rerun");
  assert.equal(
    result.catalog.rows.find(
      (row) => row.id === site.id && row.caseId === cases[0].id,
    ).status,
    "product-failed",
  );

  assert.equal(result.catalog.rejectedCandidates.length, 1);
  for (const { name, overrides } of [
    { name: "invalid-time", overrides: { completedAt: "not-a-date" } },
    { name: "unknown-outcome", overrides: { outcome: "almost-passed" } },
    { name: "partial-pass", overrides: { checks: ["H01"] } },
  ]) {
    await record(update, cases[0], "passed", "2026-10-22T01:00:00Z", overrides);
    result = await report(name);
    assert.notEqual(result.code, 0, `${name} must be rejected explicitly`);
    assert.match(result.stderr, /invalid|candidate|checkpoint/i);
  }
  await manifest(update, mode, site.components);
  await record(update, cases[0], "passed", "2026-10-22T01:00:00Z");
  result = await report("missing-union-contract");
  assert.equal(result.code, 1);
  assert.equal(result.catalog.counts.unrun, 1);
  await manifest(update, mode, [cases[0]]);

  await record(update, cases[0], "passed", "2026-10-22T01:00:00Z", {
    environment: { ...environment, mode: otherMode },
  });
  result = await report("incompatible-record");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /environment/i);

  await manifest(update, otherMode);
  result = await report("mixed-modes");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /mode/i);
  await writeFile(
    join(directory, "verification.json"),
    JSON.stringify(
      {
        passed: true,
        scenarios: [
          "targeted supplement",
          "newest failure and block win",
          "malformed candidate rejected",
          "invalid timestamp, outcome and incomplete pass rejected",
          "missing union contract remains unrun",
          "declared selection union",
          "stale rejected",
          "incompatible environment rejected",
          "mixed modes rejected",
          "source provenance and artifact links",
        ],
      },
      null,
      2,
    ),
  );
  return join(directory, "verification.json");
}
