import { readFile } from "node:fs/promises";
import { test, expect, type BrowserContext } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Keep every local case offline, including the worker's CDN CSS fetch.
async function routeStyles(context: BrowserContext) {
  await context.route("https://styles.example.com/dark.css", async (route) =>
    route.fulfill({
      contentType: "text/css",
      body: await readFile("tests/dark-fixture.css", "utf8"),
    }),
  );
}

// Failure contracts: dark text on light surfaces becomes readable dark UI without
// pixel inversion, media or draft changes. Toggle, reload, cross-tab and Pause
// are reversible; CSS/DOM changes update; native extension messaging still works.
test("Dark mode: readable surfaces, preserved media, lifecycle and Hide coexist", async () => {
  const instance = await isolatedBrowser(undefined, {
    productionPermissions: true,
  });
  const { context, extensionId } = instance;
  await routeStyles(context);
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/dark-fixture.html");
    await page.evaluate(() => {
      const ctx = document
        .querySelector<HTMLCanvasElement>("#chart")
        .getContext("2d");
      ctx.fillStyle = "#3264c8";
      ctx.fillRect(0, 0, 80, 80);
    });
    // Locator screenshots include partially covered edge pixels when a site
    // places media at fractional coordinates. Compare the actual interior.
    const mediaPixels = async (selector: string) => {
      const rect = await page.locator(selector).boundingBox();
      return page.screenshot({
        clip: {
          x: Math.ceil(rect.x) + 1,
          y: Math.ceil(rect.y) + 1,
          width: 78,
          height: 78,
        },
      });
    };
    const photo = await mediaPixels("#photo");
    const chart = await mediaPixels("#chart");
    const original = await page
      .locator("#card")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const dock = await openDock(context, bridge, page);
    const panelFill = await dock
      .locator("#hide")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const dark = dock.locator("#dark-mode");
    await dark.click();
    await expect(dark).toHaveAttribute("aria-pressed", "true");
    await expect(dark).toHaveAttribute("aria-busy", "false");
    for (const selector of [
      "body",
      "#card",
      "#important",
      "#external",
      "#native-dark",
    ]) {
      await expect
        .poll(
          () =>
            page.locator(selector).evaluate((el) => {
              const s = getComputedStyle(el);
              const l = (value: string) => {
                const c = value
                  .match(/[\d.]+/g)
                  .slice(0, 3)
                  .map(Number)
                  .map((v) => v / 255)
                  .map((v) =>
                    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
                  );
                return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
              };
              const bg = l(s.backgroundColor),
                fg = l(s.color);
              return (
                bg < 0.15 &&
                (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05) >= 4.5
              );
            }),
          { message: selector },
        )
        .toBe(true);
    }
    expect(await mediaPixels("#photo")).toEqual(photo);
    expect(await mediaPixels("#chart")).toEqual(chart);
    await expect(page.locator("html")).toHaveCSS("filter", "none");
    await expect(page.locator("#draft")).toHaveValue("Keep my draft");
    await expect(dock.locator("#hide")).toHaveCSS(
      "background-color",
      panelFill,
    );
    await page.evaluate(() => {
      const card = document.createElement("article");
      card.id = "dynamic-card";
      card.style.cssText = "background: white; color: black";
      card.textContent = "Inserted after enabling";
      document.querySelector("main").append(card);
    });
    await expect
      .poll(() =>
        page
          .locator("#dynamic-card")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .not.toBe("rgb(255, 255, 255)");
    await dock.locator("#hide").click();
    await expect(dock.locator("#hide")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#card").click();
    await expect(page.locator("#card")).toBeHidden();
    await page.keyboard.press("Escape");
    await dock.locator("#rules-toggle").click();
    await dock.locator("#restore").click();
    await expect(page.locator("#card")).toBeVisible();
    const second = await context.newPage();
    await second.goto(page.url());
    await expect
      .poll(() =>
        second
          .locator("#card")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .not.toBe(original);
    await page.bringToFront();
    await dock.locator("#site-toggle").click();
    await dock.locator("#site-pause").click();
    await expect(page.locator("#card")).toHaveCSS("background-color", original);
    await expect(second.locator("#card")).toHaveCSS(
      "background-color",
      original,
    );
    await dock.locator("#site-pause").click();
    await expect
      .poll(() =>
        page
          .locator("#card")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .not.toBe(original);
    await dark.click();
    await expect(page.locator("#card")).toHaveCSS("background-color", original);
    await expect(second.locator("#card")).toHaveCSS(
      "background-color",
      original,
    );
    await second.reload();
    await expect(second.locator("#card")).toHaveCSS(
      "background-color",
      original,
    );
    await dark.click();
    await page.screenshot({ path: evidencePath("dark-mode-fixture.png") });
  } finally {
    await context.tracing.stop({ path: evidencePath("dark-mode-trace.zip") });
    await instance.close();
  }
});

// Forced Colors belongs to the OS. A saved request survives temporarily stepping
// aside, then resumes when the accessibility preference returns to normal.
test("Dark mode: forced colors yields and resumes without losing the setting", async () => {
  const instance = await isolatedBrowser(undefined, {
    productionPermissions: true,
  });
  const { context, extensionId } = instance;
  await routeStyles(context);
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/dark-fixture.html");
    const dock = await openDock(context, bridge, page);
    await page.emulateMedia({
      forcedColors: "active",
      reducedMotion: "reduce",
    });
    await dock.locator("#dark-mode").click();
    await expect(dock.locator("#dark-mode")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(dock.locator("#dark-mode")).toContainText("System colors");
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-darkreader-mode",
      "dynamic",
    );
    await page.emulateMedia({ forcedColors: "none" });
    await expect(page.locator("html")).toHaveAttribute(
      "data-darkreader-mode",
      "dynamic",
    );
    await dock.locator("#dark-mode").click();
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-darkreader-mode",
      "dynamic",
    );
  } finally {
    await context.tracing.stop({
      path: evidencePath("dark-forced-colors-trace.zip"),
    });
    await instance.close();
  }
});

// Failure contracts: theme injection failures must leave the existing tools
// usable; a reload retries the saved request without losing Hide rules.
test("Dark mode: failed engine load is recoverable and never blocks Hide", async () => {
  const instance = await isolatedBrowser(undefined, {
    productionPermissions: true,
  });
  const { context, extensionId } = instance;
  await routeStyles(context);
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/dark-fixture.html");
    const dock = await openDock(context, bridge, page);
    await instance.worker.evaluate(() => {
      const execute = chrome.scripting.executeScript.bind(chrome.scripting);
      chrome.scripting.executeScript = (options) =>
        options.files?.includes("theme.js")
          ? Promise.reject(new Error("Simulated theme load failure"))
          : execute(options);
    });
    await dock.locator("#dark-mode").click();
    await expect(dock.locator("#status")).toContainText(
      "Could not update dark mode",
    );
    await dock.locator("#hide").click();
    await expect(dock.locator("#hide")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#card").click();
    await expect(page.locator("#card")).toBeHidden();
    await page.keyboard.press("Escape");
    await dock.locator("#undo").click();
    await expect(page.locator("#card")).toBeVisible();
    // Toggle off remains available even when the engine never loaded.
    await dock.locator("#dark-mode").click();
    await expect(dock.locator("#dark-mode")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-darkreader-mode",
      "dynamic",
    );
  } finally {
    await context.tracing.stop({
      path: evidencePath("dark-load-failure-trace.zip"),
    });
    await instance.close();
  }
});

// Failure contracts: open shadow-root styles and newly inserted style rules are
// recolored. Repeated on/off requests leave no engine styles after the last Off.
test("Dark mode: shadow styles, stylesheet changes, keyboard and rapid toggles", async () => {
  const instance = await isolatedBrowser(undefined, {
    productionPermissions: true,
  });
  const { context, extensionId } = instance;
  await routeStyles(context);
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/dark-fixture.html");
    await page.evaluate(() => {
      const host = document.createElement("test-card");
      host.attachShadow({ mode: "open" }).innerHTML =
        "<style>p {background: white; color: black}</style><p>Shadow content</p>";
      document.querySelector("main").append(host);
    });
    const dock = await openDock(context, bridge, page);
    const dark = dock.locator("#dark-mode");
    // Slow storage must not make keyboard focus disappear during the write.
    await instance.worker.evaluate(() => {
      const set = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = async (items) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        await set(items);
      };
    });
    await dark.focus();
    await page.keyboard.press("Space");
    await expect(dark).toHaveAttribute("aria-pressed", "true");
    await expect(dark).toHaveAttribute("aria-busy", "false");
    await expect(dark).toBeFocused();
    await expect
      .poll(() =>
        page
          .locator("test-card p")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .not.toBe("rgb(255, 255, 255)");
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.textContent = "#card {background: rgb(250, 252, 254)}";
      document.head.append(style);
    });
    await expect
      .poll(() =>
        page
          .locator("#card")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
      )
      .not.toBe("rgb(250, 252, 254)");
    for (let n = 0; n < 5; n++) {
      await expect(dark).toBeEnabled();
      await dark.click();
    }
    await expect(dark).toHaveAttribute("aria-pressed", "false");
    await expect(dark).toHaveAttribute("aria-busy", "false");
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-darkreader-mode",
      "dynamic",
    );
    await expect
      .poll(() =>
        page.evaluate(() => document.querySelectorAll(".darkreader").length),
      )
      .toBe(0);
    await expect(page.locator("test-card .darkreader")).toHaveCount(0);
    await expect(page.locator("test-card p")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
  } finally {
    await context.tracing.stop({
      path: evidencePath("dark-dynamic-trace.zip"),
    });
    await instance.close();
  }
});

// Apple Maps ships a native Dark Reader opt-out. An explicit Taylr request
// themes its controls while leaving map pixels intact; Off restores that meta.
test("Dark mode: explicit Apple Maps request restores its native lock on Off", async () => {
  const instance = await isolatedBrowser(undefined, {
    productionPermissions: true,
  });
  const { context, extensionId } = instance;
  await routeStyles(context);
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    await context.route("https://maps.apple.com/frame*", async (route) =>
      route.fulfill({
        contentType: "text/html",
        body: await readFile("tests/dark-fixture.html", "utf8"),
      }),
    );
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("https://maps.apple.com/frame?test=1");
    await page.evaluate(() => {
      const meta = document.createElement("meta");
      meta.name = "darkreader-lock";
      document.head.append(meta);
    });
    const dock = await openDock(context, bridge, page);
    await dock.locator("#dark-mode").click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-darkreader-mode",
      "dynamic",
    );
    await expect(page.locator('meta[name="darkreader-lock"]')).toHaveCount(0);
    await dock.locator("#dark-mode").click();
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-darkreader-mode",
      "dynamic",
    );
    await expect(page.locator('meta[name="darkreader-lock"]')).toHaveCount(1);
  } finally {
    await context.tracing.stop({
      path: evidencePath("dark-native-lock-trace.zip"),
    });
    await instance.close();
  }
});

// Failure contracts: saving Off needs no new grant. A failed Resume must leave
// the saved pause in place, with no intermediate unpaused broadcast.
for (const action of ["Off", "Resume"] as const) {
  test(`Dark mode: denied registration keeps ${action} atomic`, async () => {
    const instance = await isolatedBrowser(undefined, {
      productionPermissions: true,
    });
    const { context, extensionId } = instance;
    await routeStyles(context);
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    try {
      const bridge = await driver(context, extensionId);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/tests/dark-fixture.html");
      const dock = await openDock(context, bridge, page);
      await dock.locator("#dark-mode").click();
      await expect(dock.locator("#dark-mode")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      if (action === "Resume") {
        await dock.locator("#site-toggle").click();
        await dock.locator("#site-pause").click();
        await expect(dock.locator("#site-pause")).toHaveText("Resume site");
      }
      await instance.worker.evaluate(() => {
        chrome.permissions.contains = async () => false;
      });
      if (action === "Off") {
        await dock.locator("#dark-mode").click();
        await expect(dock.locator("#dark-mode")).toHaveAttribute(
          "aria-pressed",
          "false",
        );
        await expect(page.locator("html")).not.toHaveAttribute(
          "data-darkreader-mode",
          "dynamic",
        );
      } else {
        await dock.locator("#site-pause").click();
        await expect(dock.locator("#status")).toContainText("allow access");
        await expect(dock.locator("#site-pause")).toHaveText("Resume site");
        const profile = await bridge.evaluate(
          async () =>
            (
              await chrome.runtime.sendMessage({
                type: "get",
                origin: "http://127.0.0.1:5173",
              })
            ).profile,
        );
        expect(profile.paused).toBe(true);
        await expect(page.locator("html")).not.toHaveAttribute(
          "data-darkreader-mode",
          "dynamic",
        );
      }
    } finally {
      await context.tracing.stop({
        path: evidencePath(`dark-denied-${action}-trace.zip`),
      });
      await instance.close();
    }
  });
}
