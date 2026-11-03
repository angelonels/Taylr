import { readFile, writeFile } from "node:fs/promises";
import { evidencePath } from "../tests/run-evidence.mjs";
const catalog = JSON.parse(await readFile("tests/sites.json", "utf8"));
const filter = process.env.TAYLR_SITES?.split(",").filter(Boolean);
if (filter?.some((id) => !catalog.some((site) => site.id === id)))
  throw new Error("Unknown TAYLR_SITES filter");
const results = [];
for (const site of catalog.filter(
  (site) => !filter || filter.includes(site.id),
)) {
  let result;
  try {
    result = JSON.parse(
      await readFile(
        evidencePath("dark-sites", site.id, "result.json"),
        "utf8",
      ),
    );
  } catch {
    result = { site: site.id, outcome: "unrun" };
  }
  results.push(result);
}
const builds = new Set(results.filter((r) => r.build).map((r) => r.build));
if (builds.size > 1)
  throw new Error("Mixed builds or harness versions in dark-mode evidence");
const counts = Object.fromEntries(
  [
    "passed",
    "blocked",
    "product-failed",
    "contract-failed",
    "environment-error",
    "harness-error",
    "unrun",
  ].map((key) => [key, results.filter((r) => r.outcome === key).length]),
);
await writeFile(
  evidencePath("dark-results.json"),
  JSON.stringify({ scope: "dark", counts, results }, null, 2),
);
console.log("Dark mode:", counts);
