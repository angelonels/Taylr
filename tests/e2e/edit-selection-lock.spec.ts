import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure: a page click while editing silently replaces the selection, adopts
// its own preview as the baseline, or activates the site's underlying control.
test("Locked editor retains its draft across page clicks until Pick", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  await context.route("http://127.0.0.1:5173/locked-editor", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Selection lock</title><style>body{padding:80px;font:18px system-ui}button{padding:30px;margin:20px}</style><button id="selected" onclick="this.textContent='Activated'">Selected</button><button id="other" onclick="this.textContent='Activated'">Other</button>`,
    }),
  );
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/locked-editor");
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    const selected = page.locator("#selected");
    const other = page.locator("#other");
    await selected.click();
    await dock.locator("#edit-opacity").fill("67");
    await expect(selected).toHaveCSS("opacity", "0.67");
    for (const target of [selected, other]) {
      await target.click();
      await expect(dock.locator("#edit-opacity")).toHaveValue("67");
      await expect(dock.locator("#edit-save")).toHaveAttribute(
        "aria-disabled",
        "false",
      );
      await expect(selected).toHaveCSS("opacity", "0.67");
      await expect(other).toHaveCSS("opacity", "1");
    }
    await expect(selected).toHaveText("Selected");
    await expect(other).toHaveText("Other");
    await dock.locator("#edit-pick").click();
    await expect(selected).toHaveCSS("opacity", "1");
    await other.click();
    await dock.locator("#edit-opacity").fill("73");
    await expect(other).toHaveCSS("opacity", "0.73");
    await page.keyboard.press("Escape");
    await expect(other).toHaveCSS("opacity", "1");
  } finally {
    await context.tracing.stop({
      path: evidencePath("edit-selection-lock.zip"),
    });
    await instance.close();
  }
});

// Failure: Restore in another tab removes the top history entry, trapping Undo
// on a missing rule instead of reaching the previous surviving edit.
test("Undo skips edits restored in another tab", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  const url = "http://127.0.0.1:5173/undo-history";
  await context.route(url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Undo history</title><style>body{padding:80px}button{padding:30px;margin:20px}</style><button id='first'>First</button><button id='second'>Second</button>",
    }),
  );
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto(url);
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    for (const id of ["first", "second"]) {
      if (id === "second") await dock.locator("#edit-pick").click();
      await page.locator(`#${id}`).click();
      await dock.locator("#edit-opacity").fill("67");
      await dock.locator("#edit-save").click();
      await expect(dock.locator("#status")).toHaveText("Changes saved.");
    }
    await bridge.evaluate(async () => {
      const origin = "http://127.0.0.1:5173";
      const { profile } = await chrome.runtime.sendMessage({
        type: "get",
        origin,
      });
      const rule = profile.rules.find((rule: { selector: string }) =>
        rule.selector.includes("second"),
      );
      await chrome.runtime.sendMessage({ type: "remove", origin, id: rule.id });
    });
    await expect(page.locator("#second")).toHaveCSS("opacity", "1");
    await dock.locator("#undo").click();
    await expect(page.locator("#first")).toHaveCSS("opacity", "1");
    await expect(dock.locator("#status")).toHaveText("Changes undone.");
  } finally {
    await context.tracing.stop({ path: evidencePath("edit-undo-history.zip") });
    await instance.close();
  }
});
