import { expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// A target must pass baseline validation. Never replace a failed selector with a broader guess.
export async function runLiveSite(browser, extensionId, site) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const panel = await context.newPage();
  const directory = `output/playwright/sites/${site.id}`;
  const origin = new URL(site.url).origin;
  const checks = [];
  let ownsProfile = false;
  await mkdir(directory, { recursive: true });
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    await page.goto(site.url, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const target = page.locator(site.target);
    await expect(target).toHaveCount(1);
    await expect(target).toBeVisible();
    await expect(page.locator(site.keep).first()).toBeVisible();
    await page.screenshot({ path: `${directory}/before.png` });
    checks.push(
      "Baseline: target is unique and visible; retained content is visible",
    );
    await panel.goto(`chrome-extension://${extensionId}/panel.html?tab=`, {
      waitUntil: "domcontentloaded",
    });
    await panel.evaluate(async (url) => {
      const current = await chrome.tabs.getCurrent();
      const tabs = await chrome.tabs.query({ windowId: current.windowId });
      const tab = tabs.find((tab) => tab.url === url);
      if (!tab)
        throw new Error(
          "Site permission is missing. Pre-grant this origin; the runner will not open repeated permission prompts.",
        );
      history.replaceState(null, "", `?tab=${tab.id}`);
    }, page.url());
    await panel.reload({ waitUntil: "domcontentloaded" });
    const initial = await panel.evaluate(
      (origin) => chrome.runtime.sendMessage({ type: "get", origin }),
      origin,
    );
    if (!initial.profile || initial.profile.rules.length)
      throw new Error(
        "Refusing to modify an existing site profile. Restore it manually or choose another test origin.",
      );
    ownsProfile = true;
    const allowed = await panel.evaluate(
      (origin) => chrome.permissions.contains({ origins: [`${origin}/*`] }),
      origin,
    );
    if (!allowed)
      throw new Error(
        "Site permission is missing; grant this origin before the live suite.",
      );
    const start = () =>
      panel.getByRole("button", { name: "Hide", exact: true }).click();
    async function hideTarget() {
      await page.bringToFront();
      await target.scrollIntoViewIfNeeded();
      const point = await target.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const x = Math.max(
          0,
          Math.min(innerWidth - 1, rect.x + Math.min(2, rect.width / 2)),
        );
        const y = Math.max(
          0,
          Math.min(innerHeight - 1, rect.y + Math.min(2, rect.height / 2)),
        );
        let hit = document.elementFromPoint(x, y),
          depth = 0;
        while (hit && hit !== element && depth < 30) {
          hit = hit.parentElement;
          depth++;
        }
        if (hit !== element)
          throw new Error(
            "Target is covered by a site overlay. Resolve the visible interstitial or report blocked.",
          );
        return { x, y, depth };
      });
      await page.mouse.move(point.x, point.y);
      if (point.depth === 0) await page.mouse.click(point.x, point.y);
      else {
        for (let i = 0; i < point.depth; i++)
          await page.keyboard.press("ArrowUp");
        await page.keyboard.press("Enter");
      }
      await expect(target).toBeHidden();
    }
    await start();
    await start();
    await expect(page.getByRole("region", { name: "Taylr Hide" })).toHaveCount(
      1,
    );
    const originalUrl = page.url();
    await hideTarget();
    expect(page.url()).toBe(originalUrl);
    await expect(page.locator(site.keep).first()).toBeVisible();
    await page.screenshot({ path: `${directory}/hidden.png` });
    checks.push(
      "Hide: picker is singular, selected component disappears, content and URL remain",
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(target).toBeVisible();
    checks.push("Undo: the same component returns without page navigation");
    await hideTarget();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(target).toBeHidden();
    const revisit = await context.newPage();
    await revisit.goto(site.url, { waitUntil: "domcontentloaded" });
    await expect(revisit.locator(site.target)).toBeHidden();
    checks.push("Persistence: reload and a new tab keep the component hidden");
    await panel.reload({ waitUntil: "domcontentloaded" });
    await panel.getByRole("button", { name: "Restore", exact: true }).click();
    await expect(target).toBeVisible();
    await expect(revisit.locator(site.target)).toBeVisible();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(target).toBeVisible();
    checks.push("Restore: both tabs recover, including after reload");
    await start();
    await page.bringToFront();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Taylr Hide" })).toHaveCount(
      0,
    );
    checks.push("Exit: Escape removes the picker and leaves content visible");
    await panel.setViewportSize({ width: 360, height: 900 });
    await panel.screenshot({ path: `${directory}/panel.png` });
    return { site: site.id, passed: true, checks };
  } finally {
    if (ownsProfile)
      await panel
        .evaluate(
          (origin) => chrome.runtime.sendMessage({ type: "restore", origin }),
          origin,
        )
        .catch(() => {});
    await context.tracing.stop({ path: `${directory}/trace.zip` });
    await writeFile(
      `${directory}/checks.json`,
      JSON.stringify({ site: site.id, checks }, null, 2),
    );
    await context.close();
  }
}
