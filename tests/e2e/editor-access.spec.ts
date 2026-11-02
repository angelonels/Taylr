import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure: an extension menu hides the site's accessibility tree and locks its body;
// long names displace controls and color dismissal loses keyboard focus.
test("Editor menus preserve the page and return keyboard focus", async () => {
  const instance = await isolatedBrowser();
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
    await startEdit(dock);
    await page.locator("#keep").click();
    const font = dock.locator("#edit-font-family");
    await font.focus();
    await page.keyboard.press("Space");
    await expect(dock.getByRole("listbox")).toBeVisible();
    expect(
      await page.evaluate(() => ({
        hidden: document.querySelectorAll('body [data-aria-hidden="true"]')
          .length,
        pointer: document.body.style.pointerEvents,
        scroll: document.body.hasAttribute("data-scroll-locked"),
      })),
    ).toEqual({ hidden: 0, pointer: "", scroll: false });
    await page.keyboard.press("Escape");
    await expect(font).toBeFocused();
    const swatch = dock.getByRole("button", {
      name: "Pick color",
      exact: true,
    });
    await swatch.click();
    await dock.getByRole("slider", { name: "Hue", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(swatch).toBeFocused();
    await expect(
      dock.getByRole("region", { name: "Element editor" }),
    ).toBeVisible();
    await page.screenshot({ path: evidencePath("editor-menu-focus.png") });
  } finally {
    await context.tracing.stop({
      path: evidencePath("editor-menu-focus-trace.zip"),
    });
    await instance.close();
  }
});

// Failure: unsupported single colors and mixed border colors silently reuse a
// previous hue, so the first slider gesture can repaint the element unexpectedly.
test("Color picker resolves browser colors and marks mixed colors", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId),
      page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    await page.locator("#keep").evaluate((element) =>
      Object.assign((element as HTMLElement).style, {
        color: "#2176ff",
        borderColor: "red green blue orange",
      }),
    );
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    await page.locator("#keep").click();
    await dock.locator("#edit-color").fill("inherit");
    await dock.getByRole("button", { name: "Pick color", exact: true }).click();
    await expect(
      dock.getByRole("slider", { name: "Hue", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await dock.locator("#edit-color").fill("rebeccapurple");
    await dock.getByRole("button", { name: "Pick color", exact: true }).click();
    await expect(
      dock.getByRole("slider", { name: "Hue", exact: true }),
    ).toHaveValue("270");
    await page.keyboard.press("Escape");
    await dock
      .getByRole("button", { name: "Pick border color", exact: true })
      .click();
    await expect(
      dock.getByRole("slider", { name: "Hue", exact: true }),
    ).toBeDisabled();
    await expect(
      dock.getByRole("dialog", { name: "Border color" }),
    ).toContainText("Mixed colors");
  } finally {
    await context.tracing.stop({
      path: evidencePath("editor-browser-colors-trace.zip"),
    });
    await instance.close();
  }
});
