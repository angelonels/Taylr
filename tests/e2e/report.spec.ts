import { test } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runReportScenarios } from "../scenarios/report.mjs";

// Playwright requires destructuring here; this scenario owns its disposable extension context.
// oxlint-disable-next-line no-empty-pattern
test("Report CLI: strict multi-root provenance without cherry-picking", async ({}, testInfo) => {
  const instance = await isolatedBrowser();
  try {
    const path = await runReportScenarios(
      testInfo.outputPath("report-contract"),
      instance.environment,
    );
    await testInfo.attach("report-verification", {
      path,
      contentType: "application/json",
    });
  } finally {
    await instance.close();
  }
});
