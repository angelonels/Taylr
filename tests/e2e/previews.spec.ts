import { evidencePath } from "../run-evidence.mjs";
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";

// Failure contracts: a real capture followed by reflow, scroll, or removal must
// never save pixels from the old rectangle. The requested Hide still commits.
for (const change of ["reflow", "scroll", "disconnect"]) {
  test(`Preview geometry: ${change} discards stale pixels`, async () => {
    const instance = await isolatedBrowser(undefined, { capture: true });
    const { context, extensionId } = instance;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    try {
      const bridge = await driver(context, extensionId);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/tests/fixture.html");
      const dock = await openDock(context, bridge, page);
      await bridge.evaluate(
        async ({ url, change }) => {
          const tab = (await chrome.tabs.query({})).find((t) => t.url === url);
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            args: [change],
            func: (change) => {
              const send = chrome.runtime.sendMessage.bind(chrome.runtime);
              chrome.runtime.sendMessage = async (message) => {
                const result = await send(message);
                if (message.type === "capture-preview") {
                  if (!result.preview)
                    throw new Error(
                      "Expected native capture before geometry change",
                    );
                  document.documentElement.dataset.captured = "true";
                  const target =
                    document.querySelector<HTMLElement>("#distraction");
                  if (change === "reflow")
                    target.style.transform = "translateY(40px)";
                  if (change === "scroll") {
                    document.body.style.minHeight = "3000px";
                    scrollTo(0, 100);
                  }
                  if (change === "disconnect") target.remove();
                }
                return result;
              };
            },
          });
        },
        { url: page.url(), change },
      );
      await dock.locator("#hide").click();
      await expect(dock.locator("#hide")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.locator("#distraction").click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-captured",
        "true",
      );
      await expect
        .poll(() =>
          bridge.evaluate(async () => {
            const key = "site:http://127.0.0.1:5173";
            return (await chrome.storage.local.get(key))[key]?.rules.length;
          }),
        )
        .toBe(1);
      const rule = await bridge.evaluate(async () => {
        const key = "site:http://127.0.0.1:5173";
        return (await chrome.storage.local.get(key))[key].rules[0];
      });
      expect(rule.preview).toBeUndefined();
      if (change !== "disconnect")
        await expect(page.locator("#distraction")).toBeHidden();
    } finally {
      await context.tracing.stop({
        path: evidencePath(`preview-${change}-trace.zip`),
      });
      await instance.close();
    }
  });
}

// Failure contracts: capture must contain the chosen component, survive reopening,
// disappear on Restore, and never prevent Hide when Chrome denies capture.
for (const capture of [true, false]) {
  test(`Component previews: ${capture ? "actual cropped pixels and persistence" : "capture unavailable still hides"}`, async () => {
    const instance = await isolatedBrowser(undefined, { capture });
    const { context, extensionId } = instance;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    try {
      const bridge = await driver(context, extensionId);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/tests/fixture.html");
      const dock = await openDock(context, bridge, page);
      await dock.locator("#hide").click();
      await expect(dock.locator("#hide")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.locator("#distraction").click();
      await expect(page.locator("#distraction")).toBeHidden();
      await dock.locator("#rules-toggle").click();
      const key = "site:http://127.0.0.1:5173";
      const stored = await bridge.evaluate(
        async (key) => (await chrome.storage.local.get(key))[key],
        key,
      );
      if (capture) {
        expect(stored.rules[0].preview).toBeDefined();
        expect(stored.rules[0].preview.width).toBeLessThanOrEqual(1024);
        expect(stored.rules[0].preview.height).toBeLessThanOrEqual(768);
        expect(stored.rules[0].preview.dataUrl.length).toBeLessThan(350000);
        await expect(
          dock.getByRole("img", { name: /Preview of An unwanted sidebar/ }),
        ).toBeVisible();
        await writeFile(
          evidencePath("component-preview.webp"),
          Buffer.from(stored.rules[0].preview.dataUrl.split(",")[1], "base64"),
        );
        await page.reload();
        await expect(page.locator("#distraction")).toBeHidden();
        await openDock(context, bridge, page);
        await dock.locator("#rules-toggle").click();
        await expect(
          dock.getByRole("img", { name: /Preview of An unwanted sidebar/ }),
        ).toBeVisible();
        await dock
          .locator(".dock")
          .screenshot({ path: evidencePath("rule-preview.png") });
      } else {
        expect(stored.rules[0].preview).toBeUndefined();
        await expect(
          dock.getByText("Text preview", { exact: true }),
        ).toBeVisible();
      }
      await dock
        .getByRole("button", {
          name: "Restore An unwanted sidebar",
          exact: true,
        })
        .click();
      await expect(page.locator("#distraction")).toBeVisible();
      await expect(dock.locator("#rules li")).toHaveCount(0);
    } finally {
      await context.tracing.stop({
        path: evidencePath(`preview-${capture}-trace.zip`),
      });
      await instance.close();
    }
  });
}

// Failure contracts: hostile site CSP cannot suppress local preview rendering;
// switching tabs cannot leak another page; quota pressure degrades only the new preview.
test("Preview isolation: CSP, inactive page, and storage pressure", async () => {
  const instance = await isolatedBrowser(undefined, { capture: true });
  const { context, extensionId, worker } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    await page.evaluate(() => {
      const meta = document.createElement("meta");
      meta.httpEquiv = "Content-Security-Policy";
      meta.content = "img-src 'none'";
      document.head.append(meta);
    });
    const dock = await openDock(context, bridge, page);
    await dock.locator("#hide").click();
    await expect(dock.locator("#hide")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#distraction").click();
    await expect(page.locator("#distraction")).toBeHidden();
    await dock.locator("#rules-toggle").click();
    await expect(dock.getByRole("img", { name: /Preview of/ })).toBeVisible();
    await dock.locator("#restore").click();
    // A capture requested by an inactive document must return no pixels.
    const second = await context.newPage();
    await second.goto("http://127.0.0.1:5173/tests/fixture.html?other");
    await second.bringToFront();
    const result = await bridge.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === url);
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () =>
          chrome.runtime.sendMessage({
            type: "capture-preview",
            rect: { x: 0, y: 0, width: 100, height: 100 },
            viewport: { width: innerWidth, height: innerHeight },
          }),
      });
      return result;
    }, page.url());
    expect(result.preview).toBeUndefined();
    await page.bringToFront();
    await worker.evaluate(() => {
      const original = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = async (value) => {
        if (
          Object.values(value).some(
            (profile: { rules?: { preview?: unknown }[] }) =>
              profile.rules?.some(
                (rule: { preview?: unknown }) => rule.preview,
              ),
          )
        ) {
          throw new Error("Injected preview quota failure");
        }
        return original(value);
      };
    });
    await dock.locator("#hide").click();
    await expect(dock.locator("#hide")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#distraction").click();
    await expect(page.locator("#distraction")).toBeHidden();
    await dock.locator("#rules-toggle").click();
    await expect(dock.getByText("Text preview", { exact: true })).toBeVisible();
    await dock.locator("#restore").click();
    await expect(page.locator("#distraction")).toBeVisible();
  } finally {
    await context.tracing.stop({
      path: evidencePath("preview-isolation-trace.zip"),
    });
    await instance.close();
  }
});

// Failure contract: background tabs may pause animation frames. Optional capture
// must not leave a clicked Hide waiting for a frame forever.
test("Paused animation frames: preview deadline still saves Hide", async () => {
  const instance = await isolatedBrowser(undefined, { capture: true });
  const { context, extensionId } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    const dock = await openDock(context, bridge, page);
    await dock.locator("#hide").click();
    await expect(dock.locator("#hide")).toHaveAttribute("aria-pressed", "true");
    await bridge.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === url);
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          window.requestAnimationFrame = () => 1;
        },
      });
    }, page.url());
    await page.locator("#distraction").click();
    await expect(page.locator("#distraction")).toBeHidden();
    await dock.locator("#rules-toggle").click();
    await expect(dock.getByText("Text preview", { exact: true })).toBeVisible();
    await expect(dock.locator("#restore")).toBeEnabled();
  } finally {
    await context.tracing.stop({
      path: evidencePath("preview-paused-frame-trace.zip"),
    });
    await instance.close();
  }
});
