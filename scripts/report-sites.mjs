import { readFile, writeFile, mkdir } from "node:fs/promises";
import { evidenceFingerprint } from "../tests/evidence.mjs";
const sites = JSON.parse(await readFile("tests/sites.json", "utf8"));
const read = (path) =>
  readFile(path, "utf8")
    .then(JSON.parse)
    .catch(() => null);
const rows = [];
for (const site of sites)
  for (const component of site.components) {
    const evidence = `sites/${site.id}/${component.id}/`;
    const result = await read(
      `output/playwright/session-results/${site.id}--${component.id}.json`,
    );
    const current =
      result?.browser === "disposable-playwright-chromium" &&
      result.fingerprint === evidenceFingerprint(site, component);
    const failure = !result?.passed
      ? await read(`output/playwright/${evidence}failure.json`)
      : null;
    const error = (result?.error ?? "").replace(/\u001b\[[0-9;]*m/g, "");
    const blocked =
      failure?.access?.securityFrame ||
      (failure?.access?.loginDialog &&
        /no exposed pointer location|scrollIntoViewIfNeeded: Element is not attached/.test(
          error,
        )) ||
      /server error|prove your humanity|just a moment|access denied|robot check|captcha|security check|error page|pardon our interruption|forbidden|service unavailable|attention required|cloudflare/i.test(
        failure?.title ?? "",
      ) ||
      /not available in your (country|region)|services are not available|enable JS and disable any ad blocker|blocked by network security|request blocked|unusual traffic|enable JavaScript and cookies|too many requests/i.test(
        failure?.text ?? "",
      ) ||
      /net::ERR_|HTTP_RESPONSE_CODE_FAILURE/.test(error) ||
      (/page\.goto: Timeout \d+ms exceeded/.test(error) &&
        /navigating to "https?:\/\//.test(error)) ||
      /js_challenge=1/.test(failure?.url ?? "");
    const status = !result
      ? "unrun"
      : !current
        ? "stale"
        : result.passed
          ? "passed"
          : blocked
            ? "blocked"
            : "failed";
    rows.push({
      id: site.id,
      name: site.name,
      url: site.url,
      category: site.category,
      component: component.component,
      caseId: component.id,
      status,
      checks: current ? (result.checks ?? failure?.checks ?? []) : [],
      completedAt: result?.completedAt,
      reason:
        status === "stale"
          ? "Build or component contract changed; rerun required."
          : failure
            ? `${failure.title}: ${error.split("\n").find(Boolean) ?? ""}`
            : "",
      evidence,
    });
  }
const counts = Object.fromEntries(
  ["passed", "blocked", "failed", "unrun", "stale"].map((status) => [
    status,
    rows.filter((row) => row.status === status).length,
  ]),
);
const verifiedSites = sites.filter((site) =>
  rows
    .filter((row) => row.id === site.id)
    .every((row) => row.status === "passed"),
).length;
await mkdir("output/playwright", { recursive: true });
await writeFile(
  "output/playwright/catalog-results.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sites: sites.length,
      verifiedSites,
      counts,
      rows,
    },
    null,
    2,
  ),
);
const escape = (text) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Taylr browser acceptance</title><style>body{font:14px/1.5 system-ui;margin:32px;color:#203c30}h1{font-size:24px}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:12px;border-bottom:1px solid #ddd;vertical-align:top}small{display:block;color:#55605a}a,.passed{color:#24583e}.failed,.blocked{color:#99391d}</style><h1>Taylr · Hide acceptance</h1><p>${sites.length} sites · ${rows.length} component contracts · ${verifiedSites} sites fully verified.</p><p>${Object.entries(
  counts,
)
  .map(([status, count]) => `${count} ${status}`)
  .join(
    " · ",
  )}</p><p>A full component pass requires a visible baseline, precise Hide without navigation, Undo, attached-but-hidden persistence after reload and in a new tab, Restore across tabs, and Escape. Stale evidence never qualifies.</p><table><tr><th>Site / component</th><th>Result</th><th>Checkpoints</th><th>Evidence</th></tr>${rows.map((row) => `<tr><td><a href="${escape(row.url)}">${escape(row.name)}</a><small>${escape(row.component)}</small></td><td class="${row.status}">${row.status}<small>${escape(row.reason)}</small></td><td>${row.checks.length}/6</td><td>${escape(row.completedAt)}<br><a href="${row.evidence}trace.zip">Trace</a> · <a href="${row.evidence}checks.json">Checks</a> · <a href="${row.evidence}${row.status === "passed" ? "hidden" : "failure"}.png">Screenshot</a></td></tr>`).join("")}</table></html>`;
await writeFile("output/playwright/catalog-report.html", html);
console.log(JSON.stringify({ sites: sites.length, verifiedSites, counts }));
