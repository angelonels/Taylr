import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, invokeAction } from "../dock-actions.mjs";

// Failure-first startup contracts. Faults originate at actual Chrome API boundaries;
// all user-visible behavior still runs through the real registered action handler.
for (const scenario of [
  "transient",
  "same-origin",
  "cross-origin",
  "early-cross-origin",
  "registration",
  "denied",
  "exhausted",
  "acknowledgement",
]) {
  // Playwright requires destructuring; each scenario owns its disposable browser.
  // oxlint-disable-next-line no-empty-pattern
  test(`Startup recovery: ${scenario}`, async ({}, testInfo) => {
    const instance = await isolatedBrowser(
      scenario === "early-cross-origin"
        ? {
            url: "http://127.0.0.1:5173/startup-initial",
            origins: ["http://localhost:5173"],
          }
        : undefined,
    );
    const { context, extensionId, worker } = instance;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    try {
      await context.route("**/startup-*", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><title>Startup fixture</title><style>aside,article{display:block;width:480px;height:120px;margin:24px;background:#dde6f9}</style><input id="draft" aria-label="Draft"><aside id="target">Hide this card</aside><article id="keep">Keep this card</article>',
        }),
      );
      const bridge = await driver(context, extensionId);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/startup-initial");
      await page.getByRole("textbox", { name: "Draft" }).fill("Unsaved work");
      let navigations = 0;
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) navigations++;
      });
      await worker.evaluate((scenario) => {
        const state = globalThis as typeof globalThis & {
          startupMetrics: {
            permissions: number;
            reloads: number;
            contentAttempts: number;
            notices: string[];
          };
        };
        const metrics = (state.startupMetrics = {
          permissions: 0,
          reloads: 0,
          contentAttempts: 0,
          notices: [],
        });
        const request = chrome.permissions.request.bind(chrome.permissions);
        chrome.permissions.request = async (options) => {
          metrics.permissions++;
          return request(options);
        };
        chrome.tabs.reload = async () => {
          metrics.reloads++;
          throw new Error("Automatic reload must never occur");
        };
        const popup = chrome.action.setPopup.bind(chrome.action);
        chrome.action.setPopup = async (options) => {
          if (options.popup) metrics.notices.push(options.popup);
          await popup(options);
        };
        chrome.action.openPopup = async () => {};
        const register = chrome.scripting.registerContentScripts.bind(
          chrome.scripting,
        );
        let registrationFailed = false;
        chrome.scripting.registerContentScripts = async (...args) => {
          if (scenario === "registration" && !registrationFailed) {
            registrationFailed = true;
            throw new Error("Temporary script registration failure");
          }
          return register(...args);
        };
        const execute = chrome.scripting.executeScript.bind(chrome.scripting);
        let failed = false;
        chrome.scripting.executeScript = async (options) => {
          const content = options.files?.includes("content.js");
          const dock = options.files?.includes("dock.js");
          if (content) metrics.contentAttempts++;
          if (
            content &&
            (scenario === "exhausted" || (scenario === "transient" && !failed))
          ) {
            failed = true;
            throw new Error("Frame with ID 0 was removed.");
          }
          if (content && scenario === "denied")
            throw new Error(
              "Cannot access contents of url. Extension manifest must request permission to access this host.",
            );
          if (
            !failed &&
            ((dock && ["same-origin", "cross-origin"].includes(scenario)) ||
              (content && scenario === "early-cross-origin"))
          ) {
            failed = true;
            const ready = new Promise<void>((resolve) => {
              const listener = (
                id: number,
                info: chrome.tabs.OnUpdatedInfo,
              ) => {
                if (id === options.target.tabId && info.status === "complete") {
                  chrome.tabs.onUpdated.removeListener(listener);
                  resolve();
                }
              };
              chrome.tabs.onUpdated.addListener(listener);
            });
            await chrome.tabs.update(options.target.tabId, {
              url:
                scenario === "same-origin"
                  ? "http://127.0.0.1:5173/startup-next"
                  : "http://localhost:5173/startup-other",
            });
            await ready;
          }
          const result = await execute(options);
          if (dock && scenario === "acknowledgement" && !failed) {
            failed = true;
            throw new Error("Frame with ID 0 was removed.");
          }
          return result;
        };
      }, scenario);
      await invokeAction(context, bridge, page);
      const metrics = await worker.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              startupMetrics: {
                permissions: number;
                reloads: number;
                contentAttempts: number;
                notices: string[];
              };
            }
          ).startupMetrics,
      );
      await testInfo.attach("startup-metrics", {
        body: JSON.stringify({
          scenario,
          metrics,
          navigations,
          url: page.url(),
        }),
        contentType: "application/json",
      });
      expect(metrics.permissions).toBe(1);
      expect(metrics.reloads).toBe(0);
      if (
        ["cross-origin", "early-cross-origin", "denied", "exhausted"].includes(
          scenario,
        )
      ) {
        await expect(page.getByRole("toolbar", { name: "Taylr" })).toHaveCount(
          0,
        );
        expect(metrics.notices).toHaveLength(1);
        if (["cross-origin", "early-cross-origin"].includes(scenario)) {
          for (const origin of [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
          ]) {
            const result = await bridge.evaluate(
              (origin) => chrome.runtime.sendMessage({ type: "get", origin }),
              origin,
            );
            expect(result.profile.rules).toHaveLength(0);
          }
        }
        const notice = await context.newPage();
        await notice.goto(
          `chrome-extension://${extensionId}/${metrics.notices[0]}`,
        );
        await expect(notice.locator("body")).not.toContainText(/reload/i);
        expect(metrics.contentAttempts).toBe(scenario === "exhausted" ? 2 : 1);
      } else {
        const dock = page.locator("taylr-tools");
        await expect(
          page.getByRole("toolbar", { name: "Taylr" }),
        ).toBeVisible();
        await expect(dock).toHaveCount(1);
        expect(metrics.notices).toHaveLength(0);
        if (scenario === "registration")
          await expect(dock.locator("#status")).toContainText(
            /register|enable|setup|persist|retry|try again/i,
          );
        await dock.locator("#hide").click();
        await expect(
          page.getByRole("region", { name: "Taylr Hide" }),
        ).toBeVisible();
        await page.locator("#target").click();
        await expect(page.locator("#target")).toBeHidden();
        await expect(page.locator("#keep")).toBeVisible();
        const profile = await bridge.evaluate(() =>
          chrome.runtime.sendMessage({
            type: "get",
            origin: "http://127.0.0.1:5173",
          }),
        );
        expect(profile.profile.rules).toHaveLength(1);
      }
      if (
        !["same-origin", "cross-origin", "early-cross-origin"].includes(
          scenario,
        )
      ) {
        expect(navigations).toBe(0);
        await expect(page.getByRole("textbox", { name: "Draft" })).toHaveValue(
          "Unsaved work",
        );
      } else {
        expect(navigations).toBe(1);
        expect(page.url()).toBe(
          scenario === "same-origin"
            ? "http://127.0.0.1:5173/startup-next"
            : "http://localhost:5173/startup-other",
        );
      }
    } finally {
      try {
        await context.tracing.stop({ path: testInfo.outputPath("trace.zip") });
      } finally {
        await instance.close();
      }
    }
  });
}
