import { expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 15000 });
import { driver, openDock } from "../dock-actions.mjs";
import { mkdir, writeFile, rm } from "node:fs/promises";

// A target must pass baseline validation. Never replace a failed selector with a broader guess.
export async function runLiveSite(context, extensionId, site) {
  const page = await context.newPage();
  const panel = await driver(context, extensionId);
  let observedPage = page;
  const directory = `output/playwright/sites/${site.id}/${site.caseId}`;
  let origin = new URL(site.url).origin;
  const checks = [];
  let ownsProfile = false;
  await rm(directory, { recursive: true, force: true });
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
    if (site.readyUrl)
      await page.waitForURL((url) => url.href.includes(site.readyUrl), {
        timeout: 100000,
      });
    let dismissed = false;
    async function dismiss() {
      if (!site.dismiss || dismissed) return;
      const control = page.locator(site.dismiss);
      const shown = await control
        .waitFor({ state: "visible", timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      if (shown) {
        await control.click();
        dismissed = true;
      }
    }
    await dismiss();
    origin = new URL(page.url()).origin;
    await writeFile(
      `${directory}/baseline.html`,
      await page.content().catch(() => ""),
    );
    let targetIdentity, retainedIdentity;
    let revisiting = false;
    const locateTarget = (targetPage) => {
      const matches = targetPage.locator(site.target);
      return targetIdentity
        ? site.identity.self
          ? matches.and(targetPage.locator(targetIdentity))
          : matches.filter({ has: targetPage.locator(targetIdentity) })
        : site.targetIndex === undefined
          ? matches
          : matches.nth(site.targetIndex);
    };
    const targets = page.locator(site.target);
    let target = locateTarget(page);
    if (site.targetIndex !== undefined)
      await expect
        .poll(() => targets.count())
        .toBeGreaterThan(site.targetIndex);
    await expect(target).toHaveCount(1);
    const kept = (targetPage) => {
      const matches = targetPage.locator(site.keep);
      if (revisiting && targetIdentity) {
        // The server can replace unselected listings between visits. Preserve
        // the chosen item's identity, and require a current independent neighbor.
        return site.identity.self
          ? matches.and(targetPage.locator(`:not(${targetIdentity})`)).first()
          : matches
              .filter({ hasNot: targetPage.locator(targetIdentity) })
              .first();
      }
      return retainedIdentity
        ? site.identity.self
          ? matches.and(targetPage.locator(retainedIdentity))
          : matches.filter({ has: targetPage.locator(retainedIdentity) })
        : matches.nth(site.keepIndex ?? 0);
    };
    await expect(target).toBeVisible();
    await dismiss();
    await expect(kept(page)).toBeVisible();
    if (site.identity) {
      const identify = async (element) => {
        const identityElement = site.identity.self
          ? element
          : element.locator(site.identity.selector).first();
        const value = await identityElement.getAttribute(
          site.identity.attribute,
        );
        if (!value) throw new Error("Declared component identity is missing.");
        return page.evaluate(
          ({ identity, value }) =>
            `${identity.selector}[${identity.attribute}=${CSS.escape(value)}]`,
          { identity: site.identity, value },
        );
      };
      targetIdentity = await identify(target);
      retainedIdentity = await identify(kept(page));
      target = locateTarget(page);
      await expect(target).toHaveCount(1);
      await expect(kept(page)).toHaveCount(1);
      await writeFile(
        `${directory}/identity.json`,
        JSON.stringify({ targetIdentity, retainedIdentity }, null, 2),
      );
    }
    const readInvariant = async () =>
      site.invariant
        ? page
            .locator(site.invariant.selector)
            .evaluate(
              (element, invariant) =>
                invariant.property
                  ? String(element[invariant.property])
                  : invariant.attribute
                    ? element.getAttribute(invariant.attribute)
                    : element.textContent,
              site.invariant,
            )
        : undefined;
    if (site.invariant && "expected" in site.invariant)
      await expect.poll(readInvariant).toBe(site.invariant.expected);
    const initialState = await readInvariant();
    await page.screenshot({ path: `${directory}/before.png` });
    origin = new URL(page.url()).origin;
    checks.push(
      "Baseline: target is unique and visible; retained content is visible",
    );
    const dock = await openDock(context, panel, page);
    await panel.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((tab) => tab.url === url);
      history.replaceState(null, "", `?tab=${tab.id}`);
    }, page.url());
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
    const start = async () => {
      if (!(await dock.locator("#hide").count()))
        await openDock(context, panel, page);
      await dock.locator("#hide").click();
      await expect(
        page.getByRole("region", { name: "Taylr Hide" }),
      ).toBeVisible();
    };
    async function hideTarget() {
      await page.bringToFront();
      await target.scrollIntoViewIfNeeded();
      const sample = () =>
        target.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const left = Math.max(0, rect.left),
            right = Math.min(innerWidth, rect.right);
          const top = Math.max(0, rect.top),
            bottom = Math.min(innerHeight, rect.bottom);
          const points = [];
          for (const fx of [0.02, 0.25, 0.5, 0.75, 0.98])
            for (const fy of [0.02, 0.25, 0.5, 0.75, 0.98]) {
              const x = left + (right - left) * fx,
                y = top + (bottom - top) * fy;
              let hit = document.elementFromPoint(x, y),
                depth = 0;
              while (hit && hit !== element && depth < 30) {
                hit = hit.parentElement;
                depth++;
              }
              if (hit === element)
                points.push({
                  x,
                  y,
                  depth,
                  relativeX: x - rect.left,
                  relativeY: y - rect.top,
                });
            }
          return points.sort((a, b) => a.depth - b.depth)[0] ?? null;
        });
      let point = await sample();
      if (!point) {
        await page.locator("taylr-tools").locator("#move").click();
        point = await sample();
      }
      if (!point) {
        // The dock moves with a spring. Wait for genuine pointer exposure after
        // moving it; neither an in-flight toolbar nor hydration is a ready target.
        try {
          await expect
            .poll(
              async () => {
                point = await sample();
                return !!point;
              },
              { timeout: 15000 },
            )
            .toBe(true);
        } catch {
          throw new Error(
            "Target has no exposed pointer location; inspect the captured overlay.",
          );
        }
      }
      await page.mouse.move(point.x, point.y);
      const selectionMatches = async () => {
        const state = await panel.evaluate(async () =>
          chrome.tabs.sendMessage(
            Number(new URL(location.href).searchParams.get("tab")),
            { type: "get-picker", selection: true },
          ),
        );
        return (
          !!state.selector &&
          target.evaluate(
            (element, selector) => document.querySelector(selector) === element,
            state.selector,
          )
        );
      };
      // Follow the actual inspector state, including semantic control grouping.
      for (let i = 0; i < 30 && !(await selectionMatches()); i++)
        await page.keyboard.press("ArrowUp");
      expect(await selectionMatches()).toBe(true);
      // Native locator clicks wait for the declared element to stop moving.
      // Preserve the sampled exposed point relative to its settled box.
      await target.click({
        position: { x: point.relativeX, y: point.relativeY },
      });
      const selection = await page.evaluate(() => {
        const host = document.querySelector("taylr-tools");
        const highlight = host?.shadowRoot?.querySelector(".highlight");
        return {
          outline: highlight?.getAttribute("style"),
          hidden: highlight?.hidden,
        };
      });
      await writeFile(
        `${directory}/selection.json`,
        JSON.stringify({ point, selection }, null, 2),
      );
      await expect(target).toBeHidden();
      const saved = await panel.evaluate(
        (origin) => chrome.runtime.sendMessage({ type: "get", origin }),
        origin,
      );
      expect(saved.profile.rules).toHaveLength(1);
      expect(
        await target.evaluate(
          (element, selector) => document.querySelector(selector) === element,
          saved.profile.rules[0].selector,
        ),
      ).toBe(true);
      await writeFile(
        `${directory}/rule.json`,
        JSON.stringify(saved.profile.rules[0], null, 2),
      );
    }
    await start();
    await panel.evaluate(async () => {
      const tab = Number(new URL(location.href).searchParams.get("tab"));
      await chrome.tabs.sendMessage(tab, { type: "start" });
    });
    await expect(page.getByRole("region", { name: "Taylr Hide" })).toHaveCount(
      1,
    );
    const originalUrl = page.url();
    await hideTarget();
    expect(page.url()).toBe(originalUrl);
    expect(await readInvariant()).toBe(initialState);
    await expect(kept(page)).toBeVisible();
    await page.screenshot({ path: `${directory}/hidden.png` });
    checks.push(
      "Hide: picker is singular, selected component disappears, content and URL remain",
    );
    await page
      .locator("taylr-tools")
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(target).toBeVisible();
    expect(await readInvariant()).toBe(initialState);
    checks.push("Undo: the same component returns without page navigation");
    await hideTarget();
    await page
      .locator("taylr-tools")
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await page.reload({ waitUntil: "domcontentloaded" });
    revisiting = true;
    await expect(target).toHaveCount(1);
    await expect(kept(page)).toBeVisible();
    await expect(target).toBeHidden();
    const revisit = await context.newPage();
    observedPage = revisit;
    await revisit.goto(site.url, { waitUntil: "domcontentloaded" });
    const revisitedTarget = locateTarget(revisit);
    await expect(revisitedTarget).toHaveCount(1);
    await expect(kept(revisit)).toBeVisible();
    await expect(revisitedTarget).toBeHidden();
    checks.push("Persistence: reload and a new tab keep the component hidden");
    observedPage = page;
    await openDock(context, panel, page);
    await dock.locator("#rules-toggle").click();
    await dock.locator("#restore").click();
    await expect(target).toBeVisible();
    observedPage = revisit;
    await expect(revisitedTarget).toBeVisible();
    observedPage = page;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(target).toBeVisible();
    expect(await readInvariant()).toBe(initialState);
    checks.push("Restore: both tabs recover, including after reload");
    await start();
    await page.bringToFront();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Taylr Hide" })).toHaveCount(
      0,
    );
    checks.push("Exit: Escape removes the picker and leaves content visible");
    await dock.locator(".dock").screenshot({ path: `${directory}/dock.png` });
    return {
      site: site.id,
      component: site.component,
      caseId: site.caseId,
      passed: true,
      checks,
    };
  } catch (error) {
    await observedPage
      .screenshot({ path: `${directory}/failure.png` })
      .catch(() => {});
    await writeFile(
      `${directory}/failure.html`,
      await observedPage.content().catch(() => ""),
    );
    await writeFile(
      `${directory}/failure.json`,
      JSON.stringify(
        {
          url: observedPage.url(),
          title: await observedPage.title().catch(() => ""),
          text: await observedPage
            .locator("body")
            .innerText({ timeout: 2000 })
            .then((text) => text.slice(0, 4000))
            .catch(() => ""),
          targetState: await observedPage
            .locator(site.target)
            .first()
            .evaluate((element) => {
              const chain = [];
              for (
                let node = element;
                node && chain.length < 8;
                node = node.parentElement
              ) {
                const style = getComputedStyle(node);
                chain.push({
                  tag: node.localName,
                  id: node.id,
                  class: node.className,
                  display: style.display,
                  visibility: style.visibility,
                  hidden: node.hidden,
                  width: node.getBoundingClientRect().width,
                  height: node.getBoundingClientRect().height,
                });
              }
              return chain;
            })
            .catch(() => []),
          profile: await panel
            .evaluate(
              (origin) => chrome.runtime.sendMessage({ type: "get", origin }),
              origin,
            )
            .catch(() => null),
          access: await observedPage
            .evaluate(() => {
              const visible = (element) =>
                !!element.getClientRects().length &&
                getComputedStyle(element).visibility !== "hidden";
              const dialog = [...document.querySelectorAll('[role="dialog"]')]
                .filter(visible)
                .map((element) => element.textContent ?? "")
                .join(" ");
              return {
                loginDialog: /log in|sign up/i.test(dialog),
                securityFrame: [
                  ...document.querySelectorAll("iframe[src]"),
                ].some(
                  (element) =>
                    visible(element) &&
                    /https:\/\/[^/]*captcha-delivery\.com\//.test(element.src),
                ),
              };
            })
            .catch(() => ({})),
          error: error.message,
          checks,
        },
        null,
        2,
      ),
    );
    throw error;
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
  }
}
