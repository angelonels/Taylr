import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure first: an application capture listener cancels range default actions
// before panel bubbling can isolate the key. Controls must still respond once.
test("Color ranges retain keyboard control after page capture cancellation", async () => {
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
    await page.evaluate(() =>
      window.addEventListener(
        "keydown",
        (event) => {
          if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
            event.preventDefault();
        },
        true,
      ),
    );
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    await page.locator("#keep").click();
    await dock.getByRole("button", { name: "Pick color", exact: true }).click();
    const hue = dock.getByRole("slider", { name: "Hue", exact: true });
    await hue.focus();
    const before = Number(await hue.inputValue());
    await page.keyboard.press("ArrowRight");
    await expect(hue).toHaveValue(String(before + 1));
    await page.keyboard.press("Home");
    await expect(hue).toHaveValue("0");
    await page.keyboard.press("End");
    await expect(hue).toHaveValue("359");
    const alpha = dock.getByRole("slider", { name: "Alpha", exact: true });
    await alpha.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(alpha).toHaveValue("99");
    await page.keyboard.press("Home");
    await expect(alpha).toHaveValue("0");
    await page.keyboard.press("End");
    await expect(alpha).toHaveValue("100");
  } finally {
    await context.tracing.stop({
      path: evidencePath("color-capture-trace.zip"),
    });
    await instance.close();
  }
});
