import { expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 15000 });
import {
  assertEditorStyles,
  assertRestoredStyles,
  readEditorStyles,
  verifyEditor,
} from "./editor.mjs";
import { within } from "../deadline.mjs";
import { captureEvidence } from "../capture.mjs";
import {
  driver,
  openDock,
  tabForPage,
  startEdit,
  startHide,
} from "../dock-actions.mjs";
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
    const dismissed = new WeakSet();
    async function dismiss(targetPage = page, deadline = Date.now() + 25000) {
      if (!site.dismiss || dismissed.has(targetPage)) return;
      const control = targetPage.locator(site.dismiss);
      const remaining = () => Math.max(1, deadline - Date.now());
      const shown = await control
        .waitFor({ state: "visible", timeout: Math.min(10000, remaining()) })
        .then(() => true)
        .catch(() => false);
      if (shown) {
        // A late appearance must not consume the native click's action budget.
        await control.click({ timeout: Math.min(15000, remaining()) });
        dismissed.add(targetPage);
      }
    }
    async function visit(targetPage, url, initial = false) {
      // One budget covers navigation and native engine initialization. Target
      // uniqueness and editor actions retain their independent 15-second gates.
      const deadline = Date.now() + 60000;
      const remaining = () => Math.max(1, deadline - Date.now());
      const options = {
        waitUntil: site.readyState ?? "domcontentloaded",
        timeout: remaining(),
      };
      const response = url
        ? await targetPage.goto(url, options)
        : await targetPage.reload(options);
      await checkAccess(targetPage, response);
      if (initial) enter("readiness");
      if (site.readyUrl)
        await targetPage.waitForURL(
          (next) => next.href.includes(site.readyUrl),
          {
            timeout: remaining(),
          },
        );
      dismissed.delete(targetPage);
      await dismiss(targetPage, deadline);
      await checkAccess(targetPage);
      if (site.readySelector)
        await targetPage.locator(site.readySelector).waitFor({
          state: "visible",
          timeout: remaining(),
        });
    }
    await visit(page, site.url, true);
    enter("baseline");
    origin = new URL(page.url()).origin;
    await writeFile(
      `${directory}/baseline.html`,
      (await page.content().catch(() => "")).slice(0, 2_000_000),
    );
    let targetIdentity, retainedIdentity, selectedSelector;
    let revisiting = false;
    const locateTarget = (targetPage) => {
      const matches = targetPage.locator(
        `css:light=${selectedSelector ?? site.target}`,
      );
      return targetIdentity
        ? site.identity.self
          ? matches.and(targetPage.locator(targetIdentity))
          : matches.filter({ has: targetPage.locator(targetIdentity) })
        : selectedSelector || site.targetIndex === undefined
          ? matches
          : matches.nth(site.targetIndex);
    };
    const targets = page.locator(`css:light=${site.target}`);
    let target = locateTarget(page);
    if (site.targetIndex !== undefined)
      await expect
        .poll(() => targets.count())
        .toBeGreaterThan(site.targetIndex);
    await expect(target).toHaveCount(1);
    const kept = (targetPage) => {
      const matches = targetPage.locator(`css:light=${site.keep}`);
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
      await startHide(dock);
      await expect(
        page.getByRole("region", { name: "Taylr Hide" }),
      ).toBeVisible();
    };
    async function selectTarget(edit = false) {
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
              const style = getComputedStyle(element);
              const left = Math.max(0, rect.left),
                right = Math.min(innerWidth, rect.right);
              const top = Math.max(0, rect.top),
                bottom = Math.min(innerHeight, rect.bottom);
              // Chromium can return a rounded-corner box from elementFromPoint
              // that elementsFromPoint and native click hit testing exclude.
              const points = [];
              for (const fx of [0.02, 0.25, 0.5, 0.75, 0.98])
                for (const fy of [0.02, 0.25, 0.5, 0.75, 0.98]) {
                  const x = left + (right - left) * fx,
                    y = top + (bottom - top) * fy;
                  let hit = document.elementsFromPoint(x, y)[0],
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
                      relativeX:
                        x -
                        rect.left -
                        (parseFloat(style.borderLeftWidth) || 0),
                      relativeY:
                        y - rect.top - (parseFloat(style.borderTopWidth) || 0),
                    });
                }
              return points.sort((a, b) => a.depth - b.depth)[0] ?? null;
            });
          let point = await sample();
          if (!point) {
            const dockObstructs = await target.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              const left = Math.max(0, rect.left),
                right = Math.min(innerWidth, rect.right),
                top = Math.max(0, rect.top),
                bottom = Math.min(innerHeight, rect.bottom);
              if (right <= left || bottom <= top) return false;
              return [0.02, 0.25, 0.5, 0.75, 0.98].every((fx) =>
                [0.02, 0.25, 0.5, 0.75, 0.98].every(
                  (fy) =>
                    document.elementsFromPoint(
                      left + (right - left) * fx,
                      top + (bottom - top) * fy,
                    )[0]?.localName === "taylr-tools",
                ),
              );
            });
            if (dockObstructs) {
              // Keyboard activation is a real supported Move action; it also
              // avoids sampling a temporary opening during pointer-driven travel.
              await page.locator("taylr-tools").locator("#move").press("Enter");
            } else {
              // Being inside the viewport does not imply exposure below sticky
              // page chrome. Center the same declared node, then wait for a hit.
              await target.evaluate((element) =>
                element.scrollIntoView({
                  block: "center",
                  inline: "center",
                  behavior: "instant",
                }),
              );
            }
            point = await sample();
          }
          if (!point) {
            // Hydration and native page overlays can delay genuine exposure.
            // Keep the same node, trusted input and total selection deadline.
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
                  const hit = document.elementsFromPoint(
                    current.x,
                    current.y,
                  )[0];
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
              const hit = document.elementsFromPoint(point.x, point.y)[0];
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
          // Lock Edit with the real page click before moving the pointer into
          // its hierarchy controls. Hide remains a hover preview until commit.
          const clickTarget = () =>
            target.click({
              position: { x: point.relativeX, y: point.relativeY },
              // Preserve the freshly verified viewport hit. A second implicit
              // scroll invalidates local offsets on oversized or snapping nodes.
              scroll: "none",
              timeout: remaining(),
            });
          if (edit) {
            await clickTarget();
            await expect(
              dock.getByRole("region", { name: "Element editor" }),
            ).toBeVisible({ timeout: remaining() });
          }
          const selectionRelation = async () => {
            const state = await panel.evaluate(async () =>
              chrome.tabs.sendMessage(
                Number(new URL(location.href).searchParams.get("tab")),
                { type: "get-picker", selection: true },
              ),
            );
            pickerDiagnostic.states.push({ ...state, at: Date.now() });
            return target.evaluate((element, selector) => {
              const picked = selector ? document.querySelector(selector) : null;
              if (picked === element) return "same";
              if (picked?.contains(element)) return "ancestor";
              if (picked && element.contains(picked)) return "descendant";
              return "unrelated";
            }, state.selector);
          };
          // Semantic controls can promote a hit to its enclosing link. Refine
          // in the actual ancestry direction without substituting another node.
          let relation = await selectionRelation();
          for (
            let i = 0;
            i < 30 && Date.now() < deadline && relation !== "same";
            i++
          ) {
            if (
              !(await selectionNode.evaluate((element) => element.isConnected))
            )
              break;
            if (relation !== "ancestor" && relation !== "descendant") break;
            const control = dock.locator(
              relation === "ancestor" ? "#child" : "#parent",
            );
            if (edit) await control.click({ timeout: remaining() });
            else await control.press("Enter", { timeout: remaining() });
            relation = await selectionRelation();
          }
          // Reacquire only a demonstrably replaced contract node. A connected node
          // with the wrong picker selection remains a real verification failure.
          if (!(await selectionNode.evaluate((element) => element.isConnected)))
            continue;
          expect(relation).toBe("same");
          // Hide commits only after exact refinement. Keyboard activation above
          // keeps its preview pointer over the component until this real click.
          if (!edit) await clickTarget();
          const selection = await page.evaluate(() => {
            const host = document.querySelector("taylr-tools");
            const highlight = host?.shadowRoot?.querySelector(".highlight");
            return {
              outline: highlight?.getAttribute("style"),
              hidden: highlight?.hidden,
            };
          });
          await writeFile(
            `${directory}/${edit ? "edit-selection" : "selection"}.json`,
            JSON.stringify({ point, selection, pickerDiagnostic }, null, 2),
          );
          if (edit) {
            await expect(
              dock.getByRole("region", { name: "Element editor" }),
            ).toBeVisible();
            return;
          }
          await expect(target).toBeHidden();
          const saved = await panel.evaluate(
            (origin) => chrome.runtime.sendMessage({ type: "get", origin }),
            origin,
          );
          const hiddenRules = saved.profile.rules.filter(
            (rule) => rule.kind !== "edit",
          );
          expect(hiddenRules).toHaveLength(1);
          expect(
            await target.evaluate(
              (element, selector) =>
                document.querySelector(selector) === element,
              hiddenRules[0].selector,
            ),
          ).toBe(true);
          await writeFile(
            `${directory}/rule.json`,
            JSON.stringify(hiddenRules[0], null, 2),
          );
          return;
        } catch (cause) {
          // Native scrolling can lose its retained node during framework hydration.
          // Re-enter only after proven disconnection, within the original budget.
          if (await selectionNode.evaluate((element) => element.isConnected))
            throw cause;
        } finally {
          await selectionNode.dispose();
        }
      }
      throw new Error(
        "Declared component kept being replaced before selection.",
      );
    }
    // Real-site Edit contract: exact component selection, live preview, Save,
    // Hide coexistence, reload/new-tab persistence, and Restore in both tabs.
    // Exhaustive property syntax/layout combinations live in the fixture suite.
    enter("edit");
    const originalStyle = await target.evaluate((element) => {
      const style = getComputedStyle(element);
      return { opacity: style.opacity, radius: style.borderRadius };
    });
    const assertRetained = async (targetPage) => {
      const independent = kept(targetPage);
      await expect(independent).toBeVisible();
      await expect
        .poll(() =>
          independent.evaluate((element) => {
            const matched = [];
            const walk = (rules) => {
              for (const rule of rules) {
                if (
                  rule instanceof CSSStyleRule &&
                  element.matches(rule.selectorText)
                )
                  matched.push(rule.selectorText);
                if ("cssRules" in rule) walk(rule.cssRules);
              }
            };
            for (const style of document.querySelectorAll(
              'style[data-taylr="rules"]',
            ))
              if (style.sheet) walk(style.sheet.cssRules);
            return matched;
          }),
        )
        .toEqual([]);
    };
    const readProfile = async () =>
      (
        await panel.evaluate(
          (origin) => chrome.runtime.sendMessage({ type: "get", origin }),
          origin,
        )
      ).profile;
    const readSelection = () =>
      panel.evaluate(async () =>
        chrome.tabs.sendMessage(
          Number(new URL(location.href).searchParams.get("tab")),
          { type: "get-picker", selection: true },
        ),
      );
    const withStableSelection = async (action) => {
      const before = (await readProfile()).rules;
      let original = await target.elementHandle();
      expect(original).not.toBeNull();
      const invoke = async () => {
        const result = await action();
        try {
          expect(
            await target.evaluate(
              (element, original) => element === original,
              original,
            ),
          ).toBe(true);
          return result;
        } catch (cause) {
          await result?.node?.dispose();
          throw cause;
        }
      };
      try {
        try {
          return await invoke();
        } catch (cause) {
          const selection = await readSelection();
          const disconnected = !(await original.evaluate(
            (element) => element.isConnected,
          ));
          // Retry this round-trip once only after an actual replacement and
          // the picker losing its selection. Connected wrong ancestors must fail.
          if (!disconnected || selection.selector) throw cause;
          // Only an unsaved interaction may be replayed. A write, profile drift,
          // connected wrong ancestor or ambiguous replacement must fail.
          expect((await readProfile()).rules).toEqual(before);
          await expect(target).toHaveCount(1);
          if (
            (await dock.locator("#edit").getAttribute("aria-pressed")) !==
            "true"
          )
            await startEdit(dock);
          await selectTarget(true);
          const replacement = await target.elementHandle();
          expect(replacement).not.toBeNull();
          await original.dispose();
          original = replacement;
          return await invoke();
        }
      } finally {
        await original.dispose();
      }
    };
    const assertSavedRules = async (targetPage) => {
      const profile = await readProfile();
      expect(profile.rules).toHaveLength(2);
      for (const rule of profile.rules) {
        const matches = targetPage.locator(`css:light=${rule.selector}`);
        await expect(matches).toHaveCount(1);
        const deadline = Date.now() + 15000;
        let matched = false;
        while (Date.now() < deadline) {
          const node = await locateTarget(targetPage).elementHandle({
            timeout: Math.max(1, deadline - Date.now()),
          });
          expect(node).not.toBeNull();
          try {
            const identity = await node.evaluate((element, selector) => {
              const matches = document.querySelectorAll(selector);
              return {
                connected: element.isConnected,
                count: matches.length,
                same: matches[0] === element,
              };
            }, rule.selector);
            // Hydration can replace the resolved handle before evaluate runs.
            // A connected wrong identity or duplicate remains an immediate failure.
            if (!identity.connected) continue;
            expect(identity.count).toBe(1);
            expect(identity.same).toBe(true);
            matched = true;
            break;
          } finally {
            await node.dispose();
          }
        }
        expect(
          matched,
          "Saved identity did not settle after node replacement",
        ).toBe(true);
      }
    };
    const editedOpacity = originalStyle.opacity === "0.67" ? "0.73" : "0.67";
    const editedRadius = originalStyle.radius === "17px" ? "19px" : "17px";
    const editUrl = page.url();
    await startEdit(dock);
    await expect(dock.locator("#edit")).toHaveAttribute("aria-pressed", "true");
    await selectTarget(true);
    await withStableSelection(async () => {
      await dock
        .locator("#edit-opacity")
        .fill(String(Number(editedOpacity) * 100));
      await dock.locator("#edit-border-radius").fill(editedRadius);
      await expect(target).toHaveCSS("opacity", editedOpacity);
      await expect(target).toHaveCSS("border-radius", editedRadius);
      await assertRetained(page);
      await dock
        .getByRole("button", { name: "Reset Opacity", exact: true })
        .click();
      await dock
        .getByRole("button", { name: "Reset Border radius", exact: true })
        .click();
      // Reset/Cancel remove our declarations. A focus-sensitive app may now have
      // a different native appearance than the earlier discovery snapshot.
      await expect(page.locator('style[data-taylr="rules"]')).toHaveText("");
      expect((await readProfile()).rules).toHaveLength(0);
      await dock
        .locator("#edit-opacity")
        .fill(String(Number(editedOpacity) * 100));
      await dock.locator("#edit-border-radius").fill(editedRadius);
      await page.keyboard.press("Escape");
      // Reset/Cancel remove our declarations. A focus-sensitive app may now have
      // a different native appearance than the earlier discovery snapshot.
      await expect(page.locator('style[data-taylr="rules"]')).toHaveText("");
      expect((await readProfile()).rules).toHaveLength(0);
    });
    await startEdit(dock);
    await expect(dock.locator("#edit")).toHaveAttribute("aria-pressed", "true");
    await selectTarget(true);
    const { node: committedNode, selector: committedSelector } =
      await withStableSelection(async () => {
        await dock
          .locator("#edit-opacity")
          .fill(String(Number(editedOpacity) * 100));
        await dock.locator("#edit-border-radius").fill(editedRadius);
        const node = await target.elementHandle();
        expect(node).not.toBeNull();
        const selector = await panel.evaluate(
          async () =>
            (
              await chrome.tabs.sendMessage(
                Number(new URL(location.href).searchParams.get("tab")),
                { type: "get-picker", selection: true },
              )
            ).selector,
        );
        try {
          expect(
            await node.evaluate(
              (element, selector) =>
                document.querySelector(selector) === element,
              selector,
            ),
          ).toBe(true);
          return { node, selector };
        } catch (cause) {
          await node.dispose();
          throw cause;
        }
      });
    await dock.locator("#edit-save").click();
    // A framework may replace the node immediately after the commit. Judge the
    // committed data and actual CSS; a transient toast is not a storage oracle.
    await expect
      .poll(async () =>
        (await readProfile()).rules.map(({ kind, selector, styles }) => ({
          kind,
          selector,
          styles,
        })),
      )
      .toEqual([
        {
          kind: "edit",
          selector: committedSelector,
          styles: {
            opacity: editedOpacity,
            "border-radius": editedRadius,
          },
        },
      ]);
    expect(page.url()).toBe(editUrl);
    expect(await readInvariant()).toBe(initialState);
    const edited = await panel.evaluate(
      (origin) => chrome.runtime.sendMessage({ type: "get", origin }),
      origin,
    );
    expect(edited.profile.rules).toHaveLength(1);
    expect(edited.profile.rules[0].kind).toBe("edit");
    expect(edited.profile.rules[0].styles).toEqual({
      opacity: editedOpacity,
      "border-radius": editedRadius,
    });
    expect(edited.profile.rules[0].selector).toBe(committedSelector);
    await expect(target).toHaveCount(1);
    await expect(target).toHaveCSS("opacity", editedOpacity);
    await expect(target).toHaveCSS("border-radius", editedRadius);
    expect(
      await target.evaluate(
        (element, selector) => document.querySelector(selector) === element,
        committedSelector,
      ),
    ).toBe(true);
    await committedNode.dispose();
    await writeFile(
      `${directory}/edit-rule.json`,
      JSON.stringify(edited.profile.rules[0], null, 2),
    );
    // The first saved selector was just proved to identify the declared node.
    // Continue tracking it when a successful edit changes a discovery text label.
    selectedSelector = edited.profile.rules[0].selector;
    target = locateTarget(page);
    // A native replacement can occur after the strict identity proof above.
    // Renew the editor handoff every time; committed Save is never replayed.
    await page.keyboard.press("Escape");
    await startEdit(dock);
    await selectTarget(true);
    const editorVerification = await verifyEditor({
      page,
      dock,
      target,
      selectTarget,
      readProfile,
      readSelection,
      withStableSelection,
      directory,
    });
    await assertRetained(page);
    await captureEvidence(page, `${directory}/edited.png`);
    await page.keyboard.press("Escape");
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
    await selectTarget();
    expect(page.url()).toBe(originalUrl);
    expect(await readInvariant()).toBe(initialState);
    await assertRetained(page);
    await captureEvidence(page, `${directory}/hidden.png`);
    checks.push(
      "Edit: available properties, eligible text, invalid CSS, color keyboard, merge and Undo; Hide preserves independent content and URL",
    );
    enter("undo");
    await page
      .locator("taylr-tools")
      .getByRole("button", { name: "Undo", exact: true })
      .click();
    await expect(target).toBeVisible();
    await assertEditorStyles(target, editorVerification.values);
    await assertRetained(page);
    expect(await readInvariant()).toBe(initialState);
    enter("persistence");
    checks.push("Undo: the same component returns without page navigation");
    await selectTarget();
    await page
      .locator("taylr-tools")
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await visit(page);
    await expect.poll(() => readInvariant(page)).toBe(initialState);
    revisiting = true;
    // Re-establish the scenario's identity precondition before judging styles.
    // A missing server result remains a failed, unverified contract.
    enter("revisit-contract");
    await expect(target).toHaveCount(1);
    enter("persistence");
    await assertSavedRules(page);
    await assertRetained(page);
    await expect(target).toBeHidden();
    await expect(target).toHaveCSS(
      "opacity",
      editorVerification.values.opacity,
    );
    await assertEditorStyles(target, {
      ...editorVerification.values,
      display: "none",
    });
    if (editorVerification.report.text.applicable)
      await expect(target).toHaveText(editorVerification.report.text.saved);
    const revisit = await context.newPage();
    observedPage = revisit;
    await visit(revisit, editUrl);
    await expect.poll(() => readInvariant(revisit)).toBe(initialState);
    const revisitedTarget = locateTarget(revisit);
    enter("revisit-contract");
    await expect(revisitedTarget).toHaveCount(1);
    enter("persistence");
    await assertSavedRules(revisit);
    await assertRetained(revisit);
    await expect(revisitedTarget).toBeHidden();
    await expect(revisitedTarget).toHaveCSS(
      "opacity",
      editorVerification.values.opacity,
    );
    await assertEditorStyles(revisitedTarget, {
      ...editorVerification.values,
      display: "none",
    });
    if (editorVerification.report.text.applicable)
      await expect(revisitedTarget).toHaveText(
        editorVerification.report.text.saved,
      );
    enter("restore");
    checks.push(
      "Persistence: reload and a new tab retain Edit styles and Hide on the same component",
    );
    observedPage = page;
    await openDock(context, panel, page);
    await dock.locator("#site-toggle").click();
    await dock.locator("#site-pause").click();
    await expect(target).toBeVisible();
    await expect(revisitedTarget).toBeVisible();
    const readStyles = (locator) =>
      readEditorStyles(locator, Object.keys(editorVerification.values), true);
    const pausedStyles = await readStyles(target);
    const pausedRevisitStyles = await readStyles(revisitedTarget);
    if (editorVerification.report.text.applicable) {
      await expect(target).toHaveText(
        editorVerification.report.text.original ?? "",
      );
      await expect(revisitedTarget).toHaveText(
        editorVerification.report.text.original ?? "",
      );
    }
    await assertRetained(page);
    await assertRetained(revisit);
    await dock.locator("#site-pause").click();
    await expect(target).toBeHidden();
    await expect(revisitedTarget).toBeHidden();
    await assertEditorStyles(target, {
      ...editorVerification.values,
      display: "none",
    });
    await assertEditorStyles(revisitedTarget, {
      ...editorVerification.values,
      display: "none",
    });
    if (editorVerification.report.text.applicable) {
      await expect(target).toHaveText(editorVerification.report.text.saved);
      await expect(revisitedTarget).toHaveText(
        editorVerification.report.text.saved,
      );
    }
    await assertRetained(page);
    await assertRetained(revisit);
    await dock.locator("#rules-toggle").click();
    await expect(dock.locator(".rule")).toHaveCount(2);
    await dock.locator("#restore").click();
    expect((await readProfile()).rules).toHaveLength(0);
    await expect(page.locator('style[data-taylr="rules"]')).toHaveText("");
    await expect(revisit.locator('style[data-taylr="rules"]')).toHaveText("");
    await assertRestoredStyles(target, pausedStyles);
    await assertRestoredStyles(revisitedTarget, pausedRevisitStyles);
    if (editorVerification.report.text.applicable) {
      await expect(target).toHaveText(
        editorVerification.report.text.original ?? "",
      );
      await expect(revisitedTarget).toHaveText(
        editorVerification.report.text.original ?? "",
      );
    }
    const restored = await panel.evaluate(
      (origin) => chrome.runtime.sendMessage({ type: "get", origin }),
      origin,
    );
    expect(restored.profile.rules).toHaveLength(0);
    await expect(target).toBeVisible();
    observedPage = revisit;
    await expect(revisitedTarget).toBeVisible();
    await assertRetained(page);
    await assertRetained(revisit);
    observedPage = page;
    await visit(page);
    await expect(target).toBeVisible();
    await expect(page.locator('style[data-taylr="rules"]')).toHaveText("");
    if (editorVerification.report.text.applicable)
      await expect(target).toHaveText(
        editorVerification.report.text.original ?? "",
      );
    expect((await readProfile()).rules).toHaveLength(0);
    await assertRetained(page);
    await expect.poll(() => readInvariant(page)).toBe(initialState);
    enter("exit");
    checks.push(
      "Restore: Pause/Resume covers both tabs; Edits lists both rules; Restore clears all available properties, text and Hide, including reload",
    );
    await start();
    await page.bringToFront();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Taylr Hide" })).toHaveCount(
      0,
    );
    await expect(target).toBeVisible();
    await assertRetained(page);
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
    const failedPhase = phase;
    enter("diagnostics");
    access = await inspectAccess(observedPage).then((observed) => ({
      ...access,
      ...observed,
      status: access?.status,
      title: observed.title || access?.title,
      loginDialog: access?.loginDialog || observed.loginDialog,
      authWall: access?.authWall || observed.authWall,
      blocked: access?.blocked || observed.blocked,
    }));
    if (
      access.loginDialog &&
      /no exposed pointer location|Element is not attached/.test(error.message)
    )
      access.blocked = true;
    failure = classifyFailure(error, failedPhase, access);
    failure.checks = checks;
    failure.timings = timings;
    // Persist the diagnosis before touching the failed renderer again.
    const record = {
      url: observedPage.url(),
      ...access,
      access,
      pickerDiagnostic,
      error: failure.message,
      outcome: failure.outcome,
      phase: failedPhase,
      checks,
      timings,
      targetState: [],
      nativeEvents: [],
      diagnostics: {},
    };
    const saveFailure = () =>
      writeFile(`${directory}/failure.json`, JSON.stringify(record, null, 2));
    await saveFailure().catch((error) => {
      record.diagnostics.write = error.message;
    });
    const attempts = await Promise.allSettled([
      within(
        () =>
          observedPage
            .locator(`css:light=${site.target}`)
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
            ),
        600,
        "Target diagnostics",
      ),
      within(
        () =>
          observedPage.evaluate(() => window.__taylrVerificationEvents ?? []),
        500,
        "Input diagnostics",
      ),
      captureEvidence(observedPage, `${directory}/failure.png`, {
        timeout: 1500,
      }),
      within(() => observedPage.content(), 1000, "Document diagnostics"),
    ]);
    const names = ["target", "input", "screenshot", "document"];
    attempts.forEach((attempt, index) => {
      if (attempt.status === "rejected")
        record.diagnostics[names[index]] = attempt.reason.message;
    });
    if (attempts[0].status === "fulfilled")
      record.targetState = attempts[0].value;
    if (attempts[1].status === "fulfilled")
      record.nativeEvents = attempts[1].value;
    await Promise.allSettled([
      saveFailure(),
      ...(attempts[3].status === "fulfilled"
        ? [
            writeFile(
              `${directory}/failure.html`,
              attempts[3].value.slice(0, 2_000_000),
            ),
          ]
        : []),
    ]);
    throw failure;
  } finally {
    // Record checkpoints even when cleanup or trace capture cannot reach the page.
    enter("artifacts");
    const artifacts = await Promise.allSettled([
      within(
        () =>
          context.tracing.stop(
            failure || process.env.TAYLR_TRACE === "full"
              ? { path: `${directory}/trace.zip` }
              : {},
          ),
        15000,
        "Trace capture",
      ),
      ...(ownsProfile
        ? [
            within(
              () =>
                panel.evaluate(
                  (origin) =>
                    chrome.runtime.sendMessage({ type: "restore", origin }),
                  origin,
                ),
              1500,
              "Profile cleanup",
            ),
          ]
        : []),
    ]);
    timings.artifacts = Date.now() - phaseStarted;
    const artifactErrors = artifacts.filter(
      (item) => item.status === "rejected",
    );
    if (!failure && artifactErrors.length)
      artifactFailure = classifyFailure(artifactErrors[0].reason, "artifacts");
    await writeFile(
      `${directory}/checks.json`,
      JSON.stringify(
        {
          site: site.id,
          checks,
          outcome: failure?.outcome ?? artifactFailure?.outcome ?? "passed",
          timings,
          artifactErrors: artifactErrors.map((item) => item.reason.message),
        },
        null,
        2,
      ),
    ).catch((error) => {
      if (!failure && !artifactFailure)
        artifactFailure = classifyFailure(error, "artifacts");
    });
  }
  if (artifactFailure) throw artifactFailure;
  return result;
}
