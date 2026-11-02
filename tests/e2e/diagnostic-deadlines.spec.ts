import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { captureEvidence } from "../capture.mjs";
import { runLiveSite } from "../scenarios/live.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure contracts: attaching CDP to a closed page escapes classification;
// paused third-party JavaScript traps diagnostics after the original failure.
test("Evidence capture classifies a closed target within its deadline", async () => {
  const instance = await isolatedBrowser();
  await instance.context.tracing.start({ screenshots: true, snapshots: true });
  try {
    const page = await instance.context.newPage();
    await page.close();
    await expect(
      captureEvidence(page, evidencePath("closed-target.png"), {
        timeout: 500,
      }),
    ).rejects.toMatchObject({ outcome: "harness-error", phase: "artifacts" });
  } finally {
    await instance.context.tracing.stop({
      path: evidencePath("closed-target.zip"),
    });
    await instance.close();
  }
});

test("Paused renderer preserves the original failure and settles diagnostics", async () => {
  test.setTimeout(45000);
  const site = {
    id: "paused-renderer",
    caseId: "primary",
    component: "Missing",
    url: "http://127.0.0.1:5173/paused-renderer",
    target: "#missing",
    keep: "#kept",
  };
  const instance = await isolatedBrowser(site);
  let session;
  let timer;
  await instance.context.route(site.url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Paused app</title><p id='kept'>Retained</p>",
    }),
  );
  instance.context.on("page", (page) => {
    page.once("domcontentloaded", async () => {
      if (page.url() !== site.url) return;
      session = await instance.context.newCDPSession(page);
      await session.send("Debugger.enable");
      timer = setTimeout(
        () => void session.send("Debugger.pause").catch(() => {}),
        200,
      );
    });
  });
  const run = runLiveSite(instance.context, instance.extensionId, site);
  try {
    await expect(
      Promise.race([
        run,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Diagnostics exceeded 25 seconds")),
            25000,
          ),
        ),
      ]),
    ).rejects.toMatchObject({ outcome: "contract-failed", phase: "baseline" });
    const checks = JSON.parse(
      await readFile(
        evidencePath("sites", site.id, site.caseId, "checks.json"),
        "utf8",
      ),
    );
    expect(checks.outcome).toBe("contract-failed");
    const failure = JSON.parse(
      await readFile(
        evidencePath("sites", site.id, site.caseId, "failure.json"),
        "utf8",
      ),
    );
    expect(failure.outcome).toBe("contract-failed");
    expect(failure.diagnostics).toBeDefined();
    expect(failure.error).toContain("#missing");
    expect(failure.timings.baseline).toBeGreaterThanOrEqual(15000);
    expect(failure.title).toBe("Paused app");
  } finally {
    clearTimeout(timer);
    await session?.send("Debugger.resume").catch(() => {});
    await run.catch(() => {});
    await session?.detach().catch(() => {});
    await instance.close();
  }
});

// Failure: a page closing after attach looks like successful evidence, and a
// hung screenshot leaves its real CDP session attached after the deadline.
test("Evidence capture rejects close-after-attach and detaches a timed-out session", async () => {
  const instance = await isolatedBrowser();
  const { context } = instance;
  await context.tracing.start({ screenshots: true, snapshots: true });
  const attach = context.newCDPSession.bind(context);
  try {
    const closed = await context.newPage();
    context.newCDPSession = async (page) => {
      const session = await attach(page);
      await closed.close();
      return session;
    };
    await expect(
      captureEvidence(closed, evidencePath("late-closed.png"), {
        timeout: 500,
      }),
    ).rejects.toMatchObject({ outcome: "harness-error" });
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    let detached = false;
    context.newCDPSession = async (target) => {
      const session = await attach(target);
      const send = session.send.bind(session),
        detach = session.detach.bind(session);
      session.send = (method, args) =>
        method === "Page.captureScreenshot"
          ? new Promise(() => {})
          : send(method, args);
      session.detach = async () => {
        await detach();
        detached = true;
      };
      return session;
    };
    await expect(
      captureEvidence(page, evidencePath("hung-screenshot.png"), {
        timeout: 250,
      }),
    ).rejects.toMatchObject({ outcome: "harness-error" });
    await expect.poll(() => detached, { timeout: 1000 }).toBe(true);
  } finally {
    context.newCDPSession = attach;
    await context.tracing.stop({
      path: evidencePath("capture-session-lifecycle.zip"),
    });
    await instance.close();
  }
});
