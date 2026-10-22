import { stripVTControlCharacters } from "node:util";
import { resolve, relative, join, sep } from "node:path";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  access,
} from "node:fs/promises";
import { evidenceFingerprint, currentEnvironment } from "../tests/evidence.mjs";
import { runRoot as defaultRoot } from "../tests/run-evidence.mjs";
const sites = JSON.parse(await readFile("tests/sites.json", "utf8"));
const read = (path) =>
  readFile(path, "utf8")
    .then(JSON.parse)
    .catch(() => null);
const args = process.argv.slice(2);
const requestedRoots = [];
let output;
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--roots") {
    while (args[index + 1] && !args[index + 1].startsWith("--"))
      requestedRoots.push(args[++index]);
  } else if (args[index] === "--output") {
    output = args[++index];
    if (!output || output.startsWith("--"))
      throw new Error("--output requires a directory.");
  } else
    throw new Error(
      "Usage: report-sites.mjs [--roots <run-root> ... --output <new-report-root>]",
    );
}
if (args.includes("--roots") && requestedRoots.length === 0)
  throw new Error("--roots requires at least one evidence directory.");
const latest = await read("output/playwright/latest-run.json");
const latestSummary = latest ? await read(`${latest.root}/summary.json`) : null;
const fallback =
  process.env.TAYLR_RUN_ROOT ??
  latestSummary?.summaries?.at(-1)?.root ??
  defaultRoot;
const explicit = requestedRoots.length > 0;
const roots = [
  ...new Set(
    (explicit ? requestedRoots : [fallback]).map((root) => resolve(root)),
  ),
];
const runRoot = resolve(output ?? fallback);
if (roots.length > 1 && (!output || roots.includes(runRoot)))
  throw new Error(
    "Merged evidence requires a separate --output directory; original reports are preserved.",
  );
const sources = await Promise.all(
  roots.map(async (root) => ({
    root,
    manifest: await read(`${root}/run.json`),
  })),
);
const mode =
  sources[0].manifest?.browserMode ??
  (process.env.TAYLR_HEADED === "1" ? "headed" : "headless");
if (explicit && sources.some((source) => source.manifest?.browserMode !== mode))
  throw new Error(
    "Input roots have incompatible or missing display modes; report headed and headless evidence separately.",
  );
const matches = (filters, site, component) =>
  (!filters?.sites || filters.sites.split(",").includes(site.id)) &&
  (!filters?.components ||
    filters.components.split(",").includes(component.id)) &&
  (!filters?.cases ||
    filters.cases.split(",").includes(`${site.id}:${component.id}`));
const overrides = {
  sites: process.env.TAYLR_SITES,
  components: process.env.TAYLR_COMPONENTS,
  cases: process.env.TAYLR_CASES,
};
const outcomes = [
  "passed",
  "blocked",
  "product-failed",
  "contract-failed",
  "environment-error",
  "harness-error",
];
const rows = [];
for (const site of sites)
  for (const component of site.components) {
    const fingerprint = evidenceFingerprint(site, component);
    const attempts = (
      await Promise.all(
        sources.map(async (source) => {
          const path = `${source.root}/session-results/${site.id}--${component.id}.json`;
          const result = explicit
            ? await readFile(path, "utf8")
                .then(JSON.parse)
                .catch((error) => {
                  if (error.code === "ENOENT") return null;
                  throw new Error(
                    `Malformed or unreadable candidate ${path}: ${error.message}`,
                  );
                })
            : await read(path);
          if (!result) return null;
          if (
            explicit &&
            (!outcomes.includes(result.outcome) ||
              !Number.isFinite(Date.parse(result.completedAt)) ||
              (result.outcome === "passed" &&
                (!Array.isArray(result.checks) ||
                  result.checks.length !== 6 ||
                  result.checks.some(
                    (check) => typeof check !== "string" || !check.trim(),
                  ) ||
                  new Set(result.checks).size !== 6)))
          )
            throw new Error(
              `Invalid outcome, timestamp or six-checkpoint pass in candidate ${path}.`,
            );
          const launchFailure =
            result.phase === "launch" && result.outcome === "harness-error";
          const compatible =
            currentEnvironment(result.environment, mode) || launchFailure;
          if (explicit && !compatible)
            throw new Error(
              `Incompatible environment in ${source.root}: ${site.id}/${component.id}; the candidate was not silently discarded.`,
            );
          const current =
            result.browser === "disposable-playwright-chromium" &&
            result.fingerprint === fingerprint &&
            compatible;
          return { source, result, current };
        }),
      )
    )
      .filter(Boolean)
      .sort(
        (left, right) =>
          Date.parse(right.result.completedAt ?? 0) -
          Date.parse(left.result.completedAt ?? 0),
      );
    const chosen = attempts.find((attempt) => attempt.current) ?? attempts[0];
    const result = chosen?.result;
    const current = chosen?.current;
    const selected =
      matches(overrides, site, component) &&
      sources.some((source) =>
        matches(source.manifest?.filters, site, component),
      );
    const status = !selected
      ? "not-selected"
      : !result
        ? "unrun"
        : !current
          ? "stale"
          : result.outcome;
    const original = chosen
      ? join(chosen.source.root, "sites", site.id, component.id)
      : null;
    const evidence = original
      ? relative(runRoot, original).split(sep).join("/") + "/"
      : "";
    const files = original
      ? (
          await Promise.all(
            ["trace.zip", "checks.json", "hidden.png", "failure.png"].map(
              async (file) =>
                await access(join(original, file))
                  .then(() => file)
                  .catch(() => null),
            ),
          )
        ).filter(Boolean)
      : [];
    rows.push({
      id: site.id,
      name: site.name,
      url: site.url,
      category: site.category,
      component: component.component,
      caseId: component.id,
      status,
      checks: current ? (result.checks ?? []) : [],
      completedAt: result?.completedAt,
      reason:
        status === "stale"
          ? "Build, harness, contract or environment evidence is missing or changed; rerun required."
          : stripVTControlCharacters(result?.error ?? "").split("\n")[0],
      phase: result?.phase,
      access: result?.access,
      environment: result?.environment,
      durationMs: result?.durationMs,
      timings: result?.timings,
      evidence,
      files,
      sourceRoot: chosen?.source.root,
      sourceRunId: chosen?.source.manifest?.id,
      attempts: attempts.map((attempt) => ({
        sourceRoot: attempt.source.root,
        runId: attempt.source.manifest?.id,
        completedAt: attempt.result.completedAt,
        outcome: attempt.result.outcome,
        eligible: attempt.current,
        rejection: attempt.current
          ? undefined
          : "Stale build, harness or component contract",
      })),
    });
  }
const statuses = [...outcomes, "unrun", "stale", "not-selected"];
const counts = Object.fromEntries(
  statuses.map((status) => [
    status,
    rows.filter((row) => row.status === status).length,
  ]),
);
const verifiedSites = sites.filter((site) =>
  rows
    .filter((row) => row.id === site.id)
    .every((row) => row.status === "passed"),
).length;
const phaseMs = {};
for (const row of rows.filter(
  (row) => !["stale", "unrun", "not-selected"].includes(row.status),
)) {
  for (const [phase, milliseconds] of Object.entries(row.timings ?? {}))
    phaseMs[phase] = (phaseMs[phase] ?? 0) + milliseconds;
}
const artifacts = { bytes: 0, traceBytes: 0, traces: 0 };
async function measure(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  )) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await measure(path);
    else {
      const bytes = (await stat(path)).size;
      artifacts.bytes += bytes;
      if (entry.name === "trace.zip") {
        artifacts.traceBytes += bytes;
        artifacts.traces++;
      }
    }
  }
}
for (const root of roots) await measure(`${root}/sites`);
await mkdir(runRoot, { recursive: true });
await writeFile(
  `${runRoot}/catalog-results.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      mode,
      sources: sources.map((source) => ({
        root: source.root,
        runId: source.manifest?.id,
      })),
      rejectedCandidates: rows.flatMap((row) =>
        row.attempts
          .filter((attempt) => !attempt.eligible)
          .map((attempt) => ({ id: row.id, caseId: row.caseId, ...attempt })),
      ),
      sites: sites.length,
      selectedContracts: rows.length - counts["not-selected"],
      verifiedSites,
      counts,
      phaseMs,
      artifacts,
      rows,
    },
    null,
    2,
  ),
);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Taylr browser acceptance</title><style>body{font:14px/1.5 system-ui;margin:32px;color:#203c30}h1{font-size:24px}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:12px;border-bottom:1px solid #ddd;vertical-align:top}small{display:block;color:#55605a}a,.passed{color:#24583e}.blocked,[class$=failed],[class$=error]{color:#99391d}</style><h1>Taylr · Hide acceptance</h1><p>${sites.length} catalog sites · ${rows.length - counts["not-selected"]}/${rows.length} selected component contracts · ${verifiedSites} sites fully verified in this run.</p><p>${Object.entries(
  counts,
)
  .filter(([, count]) => count)
  .map(([status, count]) => `${count} ${status}`)
  .join(
    " · ",
  )}</p><p>A component pass requires all six checkpoints. Access blocks never count as passes. Not-selected and historical evidence do not qualify. Passing traces are retained only with TAYLR_TRACE=full; reports/checks/screenshots remain available.</p><table><tr><th>Site / component</th><th>Result</th><th>Checkpoints / time</th><th>Evidence</th></tr>${rows
  .filter((row) => row.status !== "not-selected")
  .map(
    (row) =>
      `<tr><td><a href="${escape(row.url)}">${escape(row.name)}</a><small>${escape(row.component)}</small></td><td class="${row.status}">${escape(row.status)}<small>${escape(row.phase)} · ${escape(row.reason)}</small></td><td>${row.checks.length}/6 · ${((row.durationMs ?? 0) / 1000).toFixed(1)}s</td><td>${escape(row.completedAt)}<small>Source: ${escape(row.sourceRoot)}</small>${row.files.map((file) => `<a href="${row.evidence}${file}">${escape(file)}</a>`).join(" · ") || "No artifacts recorded"}</td></tr>`,
  )
  .join("")}</table></html>`;
await writeFile(`${runRoot}/catalog-report.html`, html);
console.log(JSON.stringify({ sites: sites.length, verifiedSites, counts }));

if (explicit) {
  const incomplete = [
    "product-failed",
    "contract-failed",
    "environment-error",
    "harness-error",
    "unrun",
    "stale",
  ].some((status) => counts[status] > 0);
  process.exitCode = incomplete ? 1 : counts.blocked > 0 ? 2 : 0;
}
