import { expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 15000 });
import { captureEvidence } from "../capture.mjs";
import { driver, openDock, tabForPage } from "../dock-actions.mjs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import {
  classifyFailure,
  evidencePath,
  inspectAccess,
  VerificationError,
} from "../run-evidence.mjs";

// A target must pass baseline validation. Never replace a failed selector with a broader guess.
export async function runLiveSite(context, extensionId, site) {
  const page = await context.newPage();
  const panel = await driver(context, extensionId);
  // Read-only, bounded breadcrumbs distinguish page-driven focus/layout changes from picker defects.
  await page.addInitScript(() => {
    const events = [];
    Object.defineProperty(window, "__taylrVerificationEvents", {
      value: events,
    });
    for (const type of ["pointermove", "focusin", "keydown"])
      window.addEventListener(
        type,
        (event) => {
          if (!event.isTrusted) return;
          const target = event.target instanceof Element ? event.target : null;
          events.push({
            type,
            at: Date.now(),
            x: event.clientX,
            y: event.clientY,
            key: event.key,
            tag: target?.localName,
            id: target?.id,
            inHeader: !!target?.closest("header"),
            activeTag: document.activeElement?.localName,
          });
          if (events.length > 80) events.shift();
        },
        { capture: true, passive: true },
      );
  });
  let observedPage = page;
  const directory = evidencePath("sites", site.id, site.caseId);
  let phase = "navigation";
  let phaseStarted = Date.now();
  const timings = {};
  const enter = (next) => {
    timings[phase] = (timings[phase] ?? 0) + Date.now() - phaseStarted;
    phase = next;
    phaseStarted = Date.now();
  };
  let access;
  let failure;
  let artifactFailure;
  let result;
  let pickerDiagnostic;
  const checkAccess = async (targetPage, response) => {
    access = await inspectAccess(targetPage, response);
    if (access.blocked)
      throw new VerificationError(
        `Website access blocked${access.status ? ` (HTTP ${access.status})` : ""}: ${access.title}`,
        { outcome: "blocked", phase, access },
      );
  };
  let origin = new URL(site.url).origin;
  const checks = [];
  let ownsProfile = false;
  try {
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
  } catch (error) {
    throw classifyFailure(error, "artifacts");
  }
  try {
    const response = await page.goto(site.url, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await checkAccess(page, response);
    enter("readiness");
    if (site.readyUrl)
      await page.waitForURL((url) => url.href.includes(site.readyUrl), {
        timeout: 30000,
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
    await checkAccess(page);
    enter("baseline");
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
    const readInvariant = async (targetPage = page) =>
      site.invariant
        ? targetPage
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
      await expect.poll(() => readInvariant()).toBe(site.invariant.expected);
    const initialState = await readInvariant();
    await captureEvidence(page, `${directory}/before.png`);
    origin = new URL(page.url()).origin;
    checks.push(
      "Baseline: target is unique and visible; retained content is visible",
    );
    const dock = await openDock(context, panel, page);
    const tab = await tabForPage(panel, page);
    await panel.evaluate((id) => {
      history.replaceState(null, "", `?tab=${id}`);
    }, tab.id);
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
      const deadline = Date.now() + 15000;
      const remaining = () => Math.max(1, deadline - Date.now());
      while (Date.now() < deadline) {
        const selectionNode = await target.elementHandle({
          timeout: remaining(),
        });
        if (!selectionNode)
          throw new Error("Declared component is unavailable.");
        try {
          await page.bringToFront();
          await target.scrollIntoViewIfNeeded({ timeout: remaining() });
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
                  { timeout: remaining() },
                )
                .toBe(true);
            } catch {
              throw new Error(
                "Target has no exposed pointer location; inspect the captured overlay.",
              );
            }
          }
          // A public page may reflow between sampling and pointer dispatch. Retry
          // only an observed miss, keeping the same contract and action budget.
          let moved = false;
          await expect
            .poll(
              async () => {
                if (moved) {
                  await target.scrollIntoViewIfNeeded({ timeout: remaining() });
                  point = await sample();
                }
                moved = true;
                if (!point) return false;
                await page.mouse.move(point.x, point.y);
                return target.evaluate((element, current) => {
                  const hit = document.elementFromPoint(current.x, current.y);
                  return !!hit && element.contains(hit);
                }, point);
              },
              { timeout: remaining() },
            )
            .toBe(true);
          pickerDiagnostic = {
            point,
            states: [],
            hit: await target.evaluate((element, point) => {
              const hit = document.elementFromPoint(point.x, point.y);
              const chain = [];
              for (
                let node = hit;
                node && chain.length < 8;
                node = node.parentElement
              )
                chain.push({
                  tag: node.localName,
                  id: node.id,
                  role: node.getAttribute("role"),
                  label: node.getAttribute("aria-label"),
                });
              return {
                insideTarget: !!hit && element.contains(hit),
                target: element.localName,
                chain,
              };
            }, point),
          };
          const selectionMatches = async () => {
            const state = await panel.evaluate(async () =>
              chrome.tabs.sendMessage(
                Number(new URL(location.href).searchParams.get("tab")),
                { type: "get-picker", selection: true },
              ),
            );
            pickerDiagnostic.states.push({ ...state, at: Date.now() });
            return (
              !!state.selector &&
              target.evaluate(
                (element, selector) =>
                  document.querySelector(selector) === element,
                state.selector,
              )
            );
          };
          // Follow the actual inspector state, including semantic control grouping.
          for (
            let i = 0;
            i < 30 && Date.now() < deadline && !(await selectionMatches());
            i++
          ) {
            if (
              !(await selectionNode.evaluate((element) => element.isConnected))
            )
              break;
            await page.keyboard.press("ArrowUp");
          }
          // Reacquire only a demonstrably replaced contract node. A connected node
          // with the wrong picker selection remains a real verification failure.
          if (!(await selectionNode.evaluate((element) => element.isConnected)))
            continue;
          expect(await selectionMatches()).toBe(true);
          // Native locator clicks wait for the declared element to stop moving.
          // Preserve the sampled exposed point relative to its settled box.
          await target.click({
            position: { x: point.relativeX, y: point.relativeY },
            timeout: remaining(),
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
            JSON.stringify({ point, selection, pickerDiagnostic }, null, 2),
          );
          await expect(target).toBeHidden();
          const saved = await panel.evaluate(
            (origin) => chrome.runtime.sendMessage({ type: "get", origin }),
            origin,
          );
          expect(saved.profile.rules).toHaveLength(1);
          expect(
            await target.evaluate(
              (element, selector) =>
                document.querySelector(selector) === element,
              saved.profile.rules[0].selector,
            ),
          ).toBe(true);
          await writeFile(
            `${directory}/rule.json`,
            JSON.stringify(saved.profile.rules[0], null, 2),
          );
          return;
        } finally {
          await selectionNode.dispose();
        }
      }
      throw new Error(
        "Declared component kept being replaced before selection.",
      );
    }
    enter("hide");
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
    await captureEvidence(page, `${directory}/hidden.png`);
    checks.push(
      "Hide: picker is singular, selected component disappears, content and URL remain",
    );
    enter("undo");
    await page
      .locator("taylr-tools")
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(target).toBeVisible();
    expect(await readInvariant()).toBe(initialState);
    enter("persistence");
    checks.push("Undo: the same component returns without page navigation");
    await hideTarget();
    await page
      .locator("taylr-tools")
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await checkAccess(
      page,
      await page.reload({ waitUntil: "domcontentloaded" }),
    );
    await expect.poll(() => readInvariant(page)).toBe(initialState);
    revisiting = true;
    await expect(target).toHaveCount(1);
    await expect(kept(page)).toBeVisible();
    await expect(target).toBeHidden();
    const revisit = await context.newPage();
    observedPage = revisit;
    await checkAccess(
      revisit,
      await revisit.goto(site.url, { waitUntil: "domcontentloaded" }),
    );
    await expect.poll(() => readInvariant(revisit)).toBe(initialState);
    const revisitedTarget = locateTarget(revisit);
    await expect(revisitedTarget).toHaveCount(1);
    await expect(kept(revisit)).toBeVisible();
    await expect(revisitedTarget).toBeHidden();
    enter("restore");
    checks.push("Persistence: reload and a new tab keep the component hidden");
    observedPage = page;
    await openDock(context, panel, page);
    await dock.locator("#rules-toggle").click();
    await dock.locator("#restore").click();
    await expect(target).toBeVisible();
    observedPage = revisit;
    await expect(revisitedTarget).toBeVisible();
    observedPage = page;
    await checkAccess(
      page,
      await page.reload({ waitUntil: "domcontentloaded" }),
    );
    await expect(target).toBeVisible();
    await expect.poll(() => readInvariant(page)).toBe(initialState);
    enter("exit");
    checks.push("Restore: both tabs recover, including after reload");
    await start();
    await page.bringToFront();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Taylr Hide" })).toHaveCount(
      0,
    );
    checks.push("Exit: Escape removes the picker and leaves content visible");
    await captureEvidence(page, `${directory}/dock.png`, {
      locator: dock.locator(".dock"),
    });
    result = {
      site: site.id,
      component: site.component,
      caseId: site.caseId,
      passed: true,
      outcome: "passed",
      phase: "complete",
      timings,
      checks,
    };
  } catch (error) {
    access = await inspectAccess(observedPage).then((observed) => ({
      ...access,
      ...observed,
      status: access?.status,
      blocked: access?.blocked || observed.blocked,
    }));
    if (
      access.loginDialog &&
      /no exposed pointer location|Element is not attached/.test(error.message)
    )
      access.blocked = true;
    failure = classifyFailure(error, phase, access);
    failure.checks = checks;
    failure.timings = timings;
    // Diagnostic collection is bounded and best-effort; it must preserve the original failure.
    const targetState = await observedPage
      .locator(site.target)
      .first()
      .evaluate(
        (element) => {
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
              display: style.display,
              visibility: style.visibility,
              hidden: node.hidden,
            });
          }
          return chain;
        },
        undefined,
        { timeout: 500 },
      )
      .catch(() => []);
    await Promise.allSettled([
      captureEvidence(observedPage, `${directory}/failure.png`, {
        timeout: 2000,
      }),
      observedPage
        .content()
        .then((html) => writeFile(`${directory}/failure.html`, html)),
      writeFile(
        `${directory}/failure.json`,
        JSON.stringify(
          {
            url: observedPage.url(),
            ...access,
            access,
            targetState,
            pickerDiagnostic,
            nativeEvents: await observedPage
              .evaluate(() => window.__taylrVerificationEvents ?? [])
              .catch(() => []),
            error: failure.message,
            outcome: failure.outcome,
            phase,
            checks,
            timings,
          },
          null,
          2,
        ),
      ),
    ]);
    throw failure;
  } finally {
    if (ownsProfile)
      await panel
        .evaluate(
          (origin) => chrome.runtime.sendMessage({ type: "restore", origin }),
          origin,
        )
        .catch(() => {});
    enter("artifacts");
    const artifacts = await Promise.allSettled([
      context.tracing.stop(
        failure || process.env.TAYLR_TRACE === "full"
          ? { path: `${directory}/trace.zip` }
          : {},
      ),
      writeFile(
        `${directory}/checks.json`,
        JSON.stringify(
          {
            site: site.id,
            checks,
            outcome: failure?.outcome ?? "passed",
            timings,
          },
          null,
          2,
        ),
      ),
    ]);
    timings.artifacts = Date.now() - phaseStarted;
    const artifactError = artifacts.find(
      (result) => result.status === "rejected",
    );
    if (!failure && artifactError)
      artifactFailure = classifyFailure(artifactError.reason, "artifacts");
  }
  if (artifactFailure) throw artifactFailure;
  return result;
}
