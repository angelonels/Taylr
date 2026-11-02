import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, tabForPage, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

type HeldWorker = { entered: boolean; release: () => void };

// Failure: Pause in another tab stops the editor before a queued Save rejects,
// and a stale-session guard silently swallows that rejection.
test("Pause ahead of Save reports the rejected edit", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId, worker } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const pageA = await context.newPage(),
      pageB = await context.newPage();
    const url = "http://127.0.0.1:5173/tests/fixture.html";
    await pageA.goto(url);
    await pageB.goto(url);
    const dockA = await openDock(context, bridge, pageA),
      dockB = await openDock(context, bridge, pageB);
    await startEdit(dockA);
    await pageA.locator("#keep").click();
    await dockA.locator("#edit-opacity").fill("67");
    await worker.evaluate(() => {
      const write = chrome.storage.local.set.bind(chrome.storage.local);
      Object.assign(globalThis, { entered: false, release: () => {} });
      chrome.storage.local.set = async (items) => {
        (globalThis as unknown as HeldWorker).entered = true;
        await new Promise<void>((resolve) => {
          (globalThis as unknown as HeldWorker).release = resolve;
        });
        chrome.storage.local.set = write;
        return write(items);
      };
    });
    await dockB.locator("#site-toggle").click();
    await dockB.locator("#site-pause").click();
    await expect
      .poll(() =>
        worker.evaluate(() => (globalThis as unknown as HeldWorker).entered),
      )
      .toBe(true);
    await dockA.locator("#edit-save").click();
    await expect(dockA.locator("#edit-save")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await worker.evaluate(() =>
      (globalThis as unknown as HeldWorker).release(),
    );
    await expect(dockA.locator("#status")).toHaveText(
      "Resume this site before editing.",
    );
    await expect(dockA.locator("#status")).toHaveAttribute(
      "data-error",
      "true",
    );
    await expect(pageA.locator("#keep")).toHaveCSS("opacity", "1");
  } finally {
    await worker
      .evaluate(() => (globalThis as unknown as HeldWorker).release?.())
      .catch(() => {});
    await context.tracing.stop({
      path: evidencePath("edit-pause-race-trace.zip"),
    });
    await instance.close();
  }
});

// Failure: a delayed Pause render overwrites feedback from a newer Resume.
test("A later Resume supersedes delayed Pause feedback", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId, worker } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const pageA = await context.newPage(),
      pageB = await context.newPage();
    await pageA.goto("http://127.0.0.1:5173/tests/fixture.html");
    await pageB.goto("http://127.0.0.1:5173/tests/fixture.html");
    const dockA = await openDock(context, bridge, pageA);
    const dockB = await openDock(context, bridge, pageB);
    await startEdit(dockA);
    await pageA.locator("#keep").click();
    await dockA.locator("#edit-opacity").fill("67");
    await dockA.locator("#edit-save").click();
    await expect(dockA.locator("#status")).toHaveText("Changes saved.");
    const tab = await tabForPage(bridge, pageA);
    await worker.evaluate((tabId) => {
      const remove = chrome.scripting.removeCSS.bind(chrome.scripting);
      Object.assign(globalThis, { entered: false, release: () => {} });
      chrome.scripting.removeCSS = async (injection) => {
        if (
          injection.target.tabId === tabId &&
          !(globalThis as unknown as HeldWorker).entered
        ) {
          (globalThis as unknown as HeldWorker).entered = true;
          await new Promise<void>((resolve) => {
            (globalThis as unknown as HeldWorker).release = resolve;
          });
          chrome.scripting.removeCSS = remove;
        }
        return remove(injection);
      };
    }, tab.id!);
    await dockA.locator("#site-toggle").click();
    await dockA.locator("#site-pause").click();
    await expect
      .poll(() =>
        worker.evaluate(() => (globalThis as unknown as HeldWorker).entered),
      )
      .toBe(true);
    await dockB.locator("#site-toggle").click();
    await expect(dockB.locator("#site-pause")).toHaveText("Resume site");
    await dockB.locator("#site-pause").click();
    await expect(dockB.locator("#status")).toHaveText("Site resumed.");
    await worker.evaluate(() =>
      (globalThis as unknown as HeldWorker).release(),
    );
    await expect(dockA.locator("#site-pause")).toHaveText("Pause site");
    await expect(pageA.locator("#keep")).toHaveCSS("opacity", "0.67");
    await expect(dockA.locator("#site-pause")).toBeEnabled();
    expect(
      (await dockA.locator("#status").allTextContents()).join(""),
    ).not.toContain("Site paused");
  } finally {
    await worker
      .evaluate(() => (globalThis as unknown as HeldWorker).release?.())
      .catch(() => {});
    await context.tracing.stop({
      path: evidencePath("pause-resume-feedback-trace.zip"),
    });
    await instance.close();
  }
});
