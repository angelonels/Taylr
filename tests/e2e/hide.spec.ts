import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const sites = JSON.parse(
  readFileSync(new URL("../sites.json", import.meta.url), "utf8"),
);
async function run(site: string) {
  let session: { url: string; token: string };
  try {
    session = JSON.parse(readFileSync(".local/browser-session.json", "utf8"));
  } catch {
    throw new Error(
      "Start npm run browser:session first. The runner never opens a fresh CDP connection.",
    );
  }
  const response = await fetch(`${session.url}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ site }),
    signal: AbortSignal.timeout(300000),
  });
  const result = await response.json();
  expect(result.passed, result.error || JSON.stringify(result)).toBe(true);
  return result;
}
test("Hide: click safety, scope, persistence, dynamic DOM, Undo, Restore, keyboard, and reflow", async () => {
  await run("fixture");
});
for (const site of sites) {
  test(`${site.name}: baseline, Hide, Undo, persistence, Restore, and Exit`, async () => {
    test.skip(
      process.env.TAYLR_LIVE_SITES !== "1",
      "Live websites are opt-in; baseline contracts and permissions must be reviewed first.",
    );
    test.skip(
      !!process.env.TAYLR_SITES &&
        !process.env.TAYLR_SITES.split(",").includes(site.id),
      "Not selected for this run.",
    );
    await run(site.id);
  });
}
