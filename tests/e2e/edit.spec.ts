import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure contracts: selecting an element activates its page handler; typing in
// the panel changes selection; invalid CSS escapes its rule; Cancel leaks draft
// styles/text; Save loses changes across reload/tabs; Reset or Restore destroys
// nested controls/site styles; Hide bypasses the shared selection or Undo.
test("Edit: live properties, reset, cancel, save, persistence and integrated Hide", async () => {
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
    let dock = await openDock(context, bridge, page);
    const target = page.locator("#keep");
    const original = await target.evaluate((el) => ({
      text: el.textContent,
      color: getComputedStyle(el).color,
      padding: getComputedStyle(el).paddingTop,
    }));
    const select = async () => {
      await startEdit(dock);
      await target.click();
      await expect(dock.locator("#edit-color")).toBeVisible();
    };
    await select();
    await dock.locator("#edit-color").fill("#e34c67");
    await expect(target).toHaveCSS("color", "rgb(227, 76, 103)");
    await dock
      .getByRole("button", { name: "Reset Color", exact: true })
      .click();
    await expect(target).toHaveCSS("color", original.color);
    await dock.locator("#edit-text").fill("A local draft");
    await expect(target).toHaveText("A local draft");
    await page.keyboard.press("Escape");
    await expect(target).toHaveText(original.text);
    await expect(target).toHaveCSS("color", original.color);
    await select();
    const values = {
      color: "#46a68b",
      "background-color": "#162832",
      opacity: "0.85",
      "font-family": "monospace",
      "font-size": "21px",
      "font-weight": "700",
      "border-radius": "24px",
      "border-color": "#eeb39a",
      "border-width": "3px",
      "border-style": "solid",
      width: "520px",
      height: "180px",
      "aspect-ratio": "16 / 9",
      "padding-top": "12px",
      "padding-right": "16px",
      "padding-bottom": "20px",
      "padding-left": "24px",
      "margin-top": "10px",
      "margin-right": "auto",
      "margin-bottom": "14px",
      "margin-left": "0px",
    };
    await dock.getByRole("button", { name: "Advanced", exact: true }).click();
    for (const [property, value] of Object.entries(values)) {
      const field = dock.locator(`#edit-${property}`);
      if (await field.evaluate((el) => el.tagName === "BUTTON")) {
        await field.click();
        await dock
          .locator(`[role="option"][data-value=${JSON.stringify(value)}]`)
          .click();
      } else
        await field.fill(
          property === "opacity" ? String(Number(value) * 100) : value,
        );
    }
    await dock.locator("#edit-text").fill("My saved component");
    await dock.locator(".edit-fields").evaluate((el) => (el.scrollTop = 0));
    await expect(dock.locator(".arc-action-content > span").first()).toHaveCSS(
      "opacity",
      "1",
    );
    await page.screenshot({ path: evidencePath("element-editor-draft.png") });
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#edit-save")).toBeDisabled();
    await dock.getByRole("button", { name: "Advanced", exact: true }).click();
    for (const [property, value] of Object.entries(values)) {
      if (
        !["color", "background-color", "border-color", "margin-right"].includes(
          property,
        )
      )
        await expect(target).toHaveCSS(property, value);
    }
    await expect(target).toHaveText("My saved component");
    await page.screenshot({ path: evidencePath("element-editor.png") });
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(target).toHaveText("My saved component");
    await expect(target).toHaveCSS("font-size", "21px");
    const second = await context.newPage();
    await second.goto(page.url());
    await expect(second.locator("#keep")).toHaveText("My saved component");
    dock = await openDock(context, bridge, page);
    await dock.locator("#site-toggle").click();
    await dock.locator("#site-pause").click();
    await expect(target).toHaveText(original.text);
    await expect(second.locator("#keep")).toHaveText(original.text);
    await dock.locator("#site-pause").click();
    await expect(target).toHaveText("My saved component");
    await startEdit(dock);
    await target.click();
    await dock.locator("#edit-hide").click();
    await expect(target).toBeHidden();
    await dock.locator("#undo").click();
    await expect(target).toBeVisible();
    await expect(target).toHaveText("My saved component");
    await page.keyboard.press("Escape");
    await dock.locator("#rules-toggle").click();
    await dock.locator("#restore").click();
    await expect(target).toHaveText(original.text);
    await expect(target).toHaveCSS("padding-top", original.padding);
    await expect(second.locator("#keep")).toHaveText(original.text);
    await expect(page.locator("#click-count")).toHaveText("0");
  } finally {
    await context.tracing.stop({ path: evidencePath("edit-trace.zip") });
    await instance.close();
  }
});

// Failure contracts: a site's new nested control must never be flattened by
// text restoration; another writer's unrelated declaration must survive Save.
test("Edit transactions: merge properties, undo a re-edit and retain new nested controls", async () => {
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
    const origin = "http://127.0.0.1:5173";
    await page.goto(`${origin}/tests/fixture.html`);
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    await page.locator("#keep").click();
    await dock.locator("#edit-text").fill("Saved text");
    await dock.locator("#edit-color").fill("#ff0000");
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#status")).toHaveText("Changes saved.");
    await dock.locator("#edit-opacity").fill("60");
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#status")).toHaveText("Changes saved.");
    await expect(page.locator("#keep")).toHaveCSS("opacity", "0.6");
    await dock.locator("#undo").click();
    await expect(page.locator("#keep")).toHaveCSS("opacity", "1");
    await expect(page.locator("#keep")).toHaveCSS("color", "rgb(255, 0, 0)");
    await expect(page.locator("#keep")).toHaveText("Saved text");
    await page.keyboard.press("Escape");
    const selector = await bridge.evaluate(async (origin) => {
      const { profile } = await chrome.runtime.sendMessage({
        type: "get",
        origin,
      });
      const selector = profile.rules[0].selector;
      await Promise.all([
        chrome.runtime.sendMessage({
          type: "edit",
          origin,
          selector,
          label: "Shared",
          styles: { "padding-top": "23px" },
        }),
        chrome.runtime.sendMessage({
          type: "edit",
          origin,
          selector,
          label: "Shared",
          styles: { "border-radius": "19px" },
        }),
      ]);
      return selector;
    }, origin);
    await expect(page.locator("#keep")).toHaveCSS("padding-top", "23px");
    await expect(page.locator("#keep")).toHaveCSS("border-radius", "19px");
    await page.evaluate(() => {
      const element = document.querySelector("#keep");
      const button = document.createElement("button");
      button.id = "site-added-control";
      button.textContent = element.textContent;
      button.onclick = () => (button.dataset.clicked = "true");
      element.replaceChildren(button);
    });
    await expect(page.locator("#site-added-control")).toBeVisible();
    await bridge.evaluate(
      ({ origin }) => chrome.runtime.sendMessage({ type: "restore", origin }),
      { origin, selector },
    );
    await expect(page.locator("#site-added-control")).toBeVisible();
    await page.locator("#site-added-control").click();
    await expect(page.locator("#site-added-control")).toHaveAttribute(
      "data-clicked",
      "true",
    );
  } finally {
    await context.tracing.stop({
      path: evidencePath("edit-transactions-trace.zip"),
    });
    await instance.close();
  }
});

test("Edit boundaries: nested DOM, invalid CSS, site replacement and stale Undo", async () => {
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
    await page.locator("#nested").click({ position: { x: 8, y: 8 } });
    await expect(dock.locator("#edit-text")).toHaveCount(0);
    await dock.locator("#edit-color").fill("red; } body { display:none");
    await expect(dock.locator("#edit-save")).toBeDisabled();
    await expect(dock.locator("#edit-color")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(page.locator("#nested-child")).toBeVisible();
    await page.keyboard.press("Escape");
    await startEdit(dock);
    await page.locator("#keep").click();
    await dock.locator("#edit-color").fill("#ff0000");
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#status")).toHaveText("Changes saved.");
    await bridge.evaluate(async () => {
      const { profile } = await chrome.runtime.sendMessage({
        type: "get",
        origin: "http://127.0.0.1:5173",
      });
      await chrome.runtime.sendMessage({
        type: "edit",
        origin: "http://127.0.0.1:5173",
        selector: profile.rules[0].selector,
        label: "Shared component",
        styles: { color: "#0000ff" },
      });
    });
    await dock.locator("#undo").click();
    await expect(page.locator("#keep")).toHaveCSS("color", "rgb(0, 0, 255)");
    await expect(dock.locator("#status")).toContainText("another tab");
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      const node = document.querySelector("#keep");
      node.replaceWith(node.cloneNode(true));
    });
    await expect(page.locator("#keep")).toHaveCSS("color", "rgb(0, 0, 255)");
    const invalid = await bridge.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "edit",
        origin: "http://127.0.0.1:5173",
        selector: "#keep",
        label: "Invalid",
        styles: { color: "red; } body {display:none}" },
      }),
    );
    expect(invalid.error).toBeTruthy();
    await expect(page.locator("h1")).toBeVisible();
  } finally {
    await context.tracing.stop({
      path: evidencePath("edit-boundaries-trace.zip"),
    });
    await instance.close();
  }
});

// Research failure contracts: replacing text nodes breaks framework references;
// an observer that fights site-owned updates must never starve the page.
test("Edit text: preserve node identity and stop observer contention", async () => {
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
    await page.evaluate(() => {
      window.__originalTextNode = document.querySelector("#keep").firstChild;
    });
    await startEdit(dock);
    await page.locator("#keep").click();
    await dock.locator("#edit-text").fill("Local text");
    expect(
      await page.evaluate(
        () =>
          document.querySelector("#keep").firstChild ===
          window.__originalTextNode,
      ),
    ).toBe(true);
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#status")).toHaveText("Changes saved.");
    await page.evaluate(() => {
      const element = document.querySelector("#keep");
      window.__siteWrites = 0;
      const observer = new MutationObserver(() => {
        if (element.textContent !== "Site update" && window.__siteWrites++ < 30)
          element.firstChild.nodeValue = "Site update";
      });
      observer.observe(element, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      element.firstChild.nodeValue = "Site update";
    });
    await expect(dock.locator("#status")).toContainText("keeps replacing");
    expect(await page.evaluate(() => window.__siteWrites)).toBeLessThan(12);
    await expect(page.locator("#keep")).toHaveText("Site update");
    await dock.locator("#edit-opacity").fill("50");
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#status")).toHaveText("Changes saved.");
    await page.evaluate(() => {
      const unrelated = document.createElement("p");
      unrelated.id = "unrelated-site-update";
      unrelated.textContent = "Other page update";
      document.body.append(unrelated);
    });
    await expect(page.locator("#unrelated-site-update")).toBeVisible();
    await expect(dock.locator("#status")).toHaveText("Changes saved.");
    await page.keyboard.press("Escape");
    await expect(dock.locator("#hide")).toBeEnabled();
  } finally {
    await context.tracing.stop({
      path: evidencePath("edit-text-contention-trace.zip"),
    });
    await instance.close();
  }
});

// Failure contracts: a rejected save must retain the draft and keyboard focus,
// never show Saved, and permit retry. The commit area survives narrow reflow.
test("Edit commit: rejected save, focused retry and narrow scroll", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId, worker } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.setViewportSize({ width: 375, height: 680 });
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    // Use keyboard selection because the panel covers this narrow fixture.
    await expect(dock.locator("#edit")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#keep").focus();
    await page.keyboard.press("Enter");
    await expect(dock.locator("#edit-color")).toBeVisible();
    await dock.locator("#edit-color").fill("#ff9077");
    await worker.evaluate(() => {
      const original = chrome.storage.local.set.bind(chrome.storage.local);
      let reject = true;
      chrome.storage.local.set = async (...args) => {
        if (reject) {
          reject = false;
          throw new Error("Storage unavailable. Try Save again.");
        }
        return original(...args);
      };
    });
    await dock.locator("#edit-save").focus();
    await page.keyboard.press("Enter");
    await expect(dock.locator("#status")).toContainText("Storage unavailable");
    await expect(dock.locator("#edit-save")).toBeFocused();
    await expect(dock.locator("#edit-save")).toHaveAttribute(
      "data-state",
      "idle",
    );
    await expect(dock.locator("#edit-color")).toHaveValue("#ff9077");
    await page.keyboard.press("Enter");
    await expect(dock.locator("#status")).toHaveText("Changes saved.");
    await expect(dock.locator("#edit-save")).toHaveAttribute(
      "data-state",
      "success",
    );
    await expect(dock.locator("#edit-save")).toBeFocused();
    await dock.getByRole("button", { name: "Advanced", exact: true }).click();
    await dock.locator("#edit-margin-left").fill("12px");
    await expect(dock.locator("#edit-save")).toBeInViewport();
    await expect(dock.locator("#close")).toBeInViewport();
    await expect(dock.locator("#edit-save")).not.toContainText("Saved");
    await page.screenshot({ path: evidencePath("editor-narrow.png") });
    // Persisting a rule is distinct from successfully installing user-origin CSS.
    await worker.evaluate(() => {
      chrome.scripting.insertCSS = async () => {
        throw new Error("Document unavailable");
      };
    });
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#status")).toContainText(
      "Could not update this page.",
    );
    await expect(dock.locator("#status")).toHaveAttribute("data-error", "true");
    await expect(dock.locator("#edit-save")).toHaveAttribute(
      "data-state",
      "idle",
    );
  } finally {
    await context.tracing.stop({ path: evidencePath("edit-commit-trace.zip") });
    await instance.close();
  }
});

// Failure contracts: UIArc popovers remain isolated inside the extension, Escape
// dismisses the active control before the editor, and disclosures retain drafts.
test("Editor controls: color picker, select keyboard and disclosure drafts", async () => {
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
    await dock.getByRole("button", { name: "Pick color", exact: true }).click();
    const picker = dock.getByRole("dialog", { name: "Color" });
    await expect(picker).toBeVisible();
    await picker.getByRole("slider", { name: "Hue", exact: true }).focus();
    const hue = picker.getByRole("slider", { name: "Hue", exact: true });
    const initialHue = Number(await hue.inputValue());
    for (let step = 0; step < 12; step++)
      await page.keyboard.press("ArrowRight");
    expect(Number(await hue.inputValue())).toBeCloseTo(initialHue + 12, 0);
    await expect(dock.locator("#edit-save")).toBeEnabled();
    await page.keyboard.press("Escape");
    await expect(picker).not.toBeVisible();
    await expect(
      dock.getByRole("region", { name: "Element editor" }),
    ).toBeVisible();
    const font = dock.locator("#edit-font-family");
    await font.focus();
    await page.keyboard.press("Space");
    await expect(dock.getByRole("listbox")).toBeVisible();
    await expect(
      dock.locator('[role="option"][data-state="checked"]'),
    ).toBeFocused();
    // Selection plus focus must retain readable text on the semantic blue fill.
    const selectedContrast = await dock
      .locator('[role="option"][data-state="checked"]')
      .evaluate((option) => {
        const luminance = (color: string) => {
          const channels = color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              const c = v / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
          return (
            channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
          );
        };
        const style = getComputedStyle(option);
        const a = luminance(style.color),
          b = luminance(style.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
    expect(selectedContrast).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: evidencePath("editor-select.png") });
    await page.keyboard.press("ArrowDown");
    await expect(
      dock.getByRole("option", { name: "Sans serif", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(font).toContainText("Sans serif");
    await expect(dock.getByRole("listbox")).not.toBeVisible();
    await expect(font).toBeFocused();
    await font.press("Space");
    await expect(dock.getByRole("listbox")).toBeVisible();
    await expect(
      dock.locator('[role="option"][data-state="checked"]'),
    ).toBeFocused();
    await page.keyboard.press("s");
    await expect(
      dock.getByRole("option", { name: "Serif", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("s");
    await expect(
      dock.getByRole("option", { name: "System default", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("End");
    await expect(
      dock.getByRole("option", { name: "Monospace", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Home");
    await expect(
      dock.getByRole("option", { name: "System default", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(font).toBeFocused();
    await expect(dock.getByRole("listbox")).not.toBeVisible();
    const group = dock.getByRole("button", { name: "Appearance", exact: true });
    await group.click();
    await expect(dock.locator("#edit-color")).not.toBeVisible();
    await group.click();
    await expect(dock.locator("#edit-color")).toBeVisible();
    await expect(
      dock.getByRole("button", { name: "Reset Color", exact: true }),
    ).toBeVisible();
    await page.screenshot({ path: evidencePath("editor-controls.png") });
  } finally {
    await context.tracing.stop({
      path: evidencePath("editor-controls-trace.zip"),
    });
    await instance.close();
  }
});
