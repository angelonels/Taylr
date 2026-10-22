import { evidencePath } from "../run-evidence.mjs";
import { expect } from "@playwright/test";
import { driver, openDock } from "../dock-actions.mjs";

export async function runFixture(context, extensionId) {
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  const page = await context.newPage();
  const panel = await driver(context, extensionId);
  let dock;
  const reopen = async () => {
    dock = await openDock(context, panel, page);
  };
  const restore = async () => {
    await panel.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "restore",
        origin: "http://127.0.0.1:5173",
      }),
    );
  };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  panel.on("pageerror", (error) => errors.push(error.message));
  let ownsProfile = false;
  try {
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");

    await reopen();
    const initial = await panel.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "get",
        origin: "http://127.0.0.1:5173",
      }),
    );
    if (!initial.profile || initial.profile.rules.length)
      throw new Error("Refusing to modify existing fixture rules.");
    ownsProfile = true;
    // Real worker RPCs: concurrent writers retain both rules and attribute creation exactly.
    const concurrent = await panel.evaluate(async () => {
      const origin = "http://127.0.0.1:5173";
      const results = await Promise.all(
        ["#distraction", "#keep"].map((selector) =>
          chrome.runtime.sendMessage({
            type: "add",
            origin,
            selector,
            label: selector,
          }),
        ),
      );
      const profile = await chrome.runtime.sendMessage({ type: "get", origin });
      const local = await chrome.storage.local.get(`site:${origin}`);
      const privateState = await chrome.storage.session.get(
        `private-site:${origin}`,
      );
      await chrome.runtime.sendMessage({ type: "restore", origin });
      return {
        results,
        profile: profile.profile,
        local,
        privateState,
        privateContext: chrome.extension.inIncognitoContext,
      };
    });
    expect(concurrent.privateContext).toBe(false);
    expect(concurrent.profile.rules).toHaveLength(2);
    expect(concurrent.results.map((result) => result.createdRuleId)).toEqual(
      concurrent.profile.rules.map((rule) => rule.id),
    );
    expect(concurrent.local["site:http://127.0.0.1:5173"].rules).toHaveLength(
      2,
    );
    expect(concurrent.privateState).toEqual({});
    // Failure cases: cancellation must work before any mutation, from either surface;
    // hostile page fonts must not change the toolbar, and reopening must stay in sync.
    await page.addStyleTag({
      content: "html { font: 30px Georgia !important; }",
    });
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeVisible();
    await expect(dock.locator("#cancel")).toBeVisible();
    const toolbarType = await page.locator("taylr-tools").evaluate((host) => {
      const toolbar = host.shadowRoot.querySelector(".bar");
      return {
        font: getComputedStyle(toolbar).fontFamily,
        size: getComputedStyle(toolbar).fontSize,
      };
    });
    expect(toolbarType.font).not.toContain("Georgia");
    expect(toolbarType.size).toBe("13px");
    await page.screenshot({ path: evidencePath("picker-active.png") });

    await page
      .locator("taylr-tools")
      .locator(".dock")
      .screenshot({
        path: evidencePath("picker-preview.png"),
        animations: "disabled",
      });
    await dock.locator("#cancel").click();
    await expect(dock.locator("#hide")).toBeFocused();
    await expect(page.getByRole("region", { name: "Taylr Hide" })).toHaveCount(
      0,
    );
    await expect(page.locator("#distraction")).toBeVisible();
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await expect(dock.locator("#cancel")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dock.locator("#cancel")).toBeHidden();
    await expect(dock.locator("#hide")).toBeEnabled();
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await page.bringToFront();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Taylr Hide" })).toHaveCount(
      0,
    );
    await expect(dock.locator("#hide")).toBeEnabled();
    // A page-driven focus change must not turn a click on a child into hiding its ancestor.
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await page.locator("#nested-child").hover();
    await page
      .locator("#nested")
      .evaluate((element) => (element.tabIndex = -1));
    await page.locator("#nested").focus();
    await page.mouse.down();
    await page.mouse.up();
    await expect(page.locator("#nested-child")).toBeHidden();
    await expect(page.locator("#nested-first")).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await dock.locator("#rules-toggle").click();
    await dock.locator("#rules button").click();
    await expect(page.locator("#nested-child")).toBeVisible();
    await expect(dock.locator("#rules-toggle")).toBeFocused();
    // Child traversal must skip elements that occupy space but are not visible.
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await page
      .locator("#nested-first")
      .evaluate((element) => (element.style.visibility = "hidden"));
    await page.locator("#nested").focus();
    await page
      .getByRole("button", { name: "Select child", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Hide selected element", exact: true })
      .click();
    await expect(page.locator("#nested-child")).toBeHidden();
    await page
      .locator("#nested-first")
      .evaluate((element) => (element.style.visibility = ""));
    await expect(page.locator("#nested-first")).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator("#nested-child")).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    // Nested glyphs/labels select the control; explicit Child refinement can select the glyph.
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await page.locator("#icon-path").click();
    await expect(page.locator("#icon-control")).toBeHidden();
    await expect(page.locator("#click-count")).toHaveText("0");
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.locator("#icon-label").click();
    await expect(page.locator("#icon-control")).toBeHidden();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.locator("#icon-path").hover();
    await page
      .getByRole("button", { name: "Select child", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Hide selected element", exact: true })
      .click();
    await expect(page.locator("#icon-graphic")).toBeHidden();
    await expect(page.locator("#icon-control")).toBeVisible();
    await expect(page.locator("#icon-label")).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    // Picker audit: synthetic events, modifiers, hierarchy round trips, and pointer controls.
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    const beforeRtl = await dock.locator(".dock").boundingBox();
    await page.evaluate(() => (document.documentElement.dir = "rtl"));
    const toolbarBox = await page
      .locator("taylr-tools")
      .locator(".dock")
      .boundingBox();
    expect(Math.abs(toolbarBox.x - beforeRtl.x)).toBeLessThan(1);
    expect(toolbarBox.width).toBe(beforeRtl.width);
    await page.evaluate(() => (document.documentElement.dir = "ltr"));
    await page
      .getByRole("button", { name: "Move toolbar", exact: true })
      .click();
    const originalPages = context.pages().length;
    await page.locator("#navigation").click({ button: "middle" });
    expect(context.pages()).toHaveLength(originalPages);
    await page
      .getByRole("button", { name: "Move toolbar", exact: true })
      .click();
    await page.evaluate(() => document.querySelector("#distraction").click());
    await expect(page.locator("#distraction")).toBeVisible();
    await page.locator("#keep").focus();
    await page.keyboard.press("Control+Enter");
    await expect(page.locator("#keep")).toBeVisible();
    // Page code can access the open shadow root and dispatch keys: neither may mutate rules.
    await page.evaluate(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    await expect(page.locator("#keep")).toBeVisible();
    await page.evaluate(() =>
      document
        .querySelector("taylr-tools")
        .shadowRoot.querySelector("#hide-selection")
        .click(),
    );
    await expect(page.locator("#keep")).toBeVisible();
    await page.evaluate(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await page.locator("#nested-child").hover();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator("#nested-child")).toBeHidden();
    await expect(page.locator("#nested-first")).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.locator("#nested-child").hover();
    await page
      .getByRole("button", { name: "Select parent", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Hide selected element", exact: true })
      .click();
    await expect(page.locator("#nested")).toBeHidden();
    await expect(page.locator("#keep")).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await page.locator("#nested-child").hover();
    await page.evaluate(
      () => (document.querySelector("#nested").style.marginTop = "80px"),
    );
    await expect
      .poll(() =>
        page.locator("taylr-highlight").evaluate((host) => {
          const outline = host.shadowRoot
            .querySelector(".outline")
            .getBoundingClientRect();
          const target = document
            .querySelector("#nested-child")
            .getBoundingClientRect();
          return (
            Math.abs(outline.y - target.y) < 1 &&
            Math.abs(outline.height - target.height) < 1
          );
        }),
      )
      .toBe(true);
    await page.evaluate(
      () => (document.querySelector("#nested").style.marginTop = ""),
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();
    // Choosing a parent must survive a click on its child and work again after Undo.
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await page.locator("#nested-child").hover();
    await page.keyboard.press("ArrowUp");
    await page.locator("#nested-first").hover();
    await page.locator("#nested-first").click();
    await expect(page.locator("#nested")).toBeHidden();
    await expect(page.locator("#keep")).toBeVisible();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator("#nested")).toBeVisible();
    await page.locator("#nested-child").hover();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");
    await expect(page.locator("#nested")).toBeHidden();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator("#nested")).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await dock.getByRole("button", { name: "Hide", exact: true }).click();
    await page.bringToFront();
    await page.locator("#distraction").click();
    await expect(page.locator("#distraction")).toBeHidden();
    await expect(page.locator("#keep")).toBeVisible();
    await expect(page.locator("#click-count")).toHaveText("0");
    await page.screenshot({ path: evidencePath("hidden.png") });
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.reload();
    await expect(page.locator("#distraction")).toBeHidden();
    await page.getByRole("button", { name: "Replace content" }).click();
    await expect(page.locator("#distraction")).toBeHidden();
    await reopen();
    await restore();
    await expect(page.locator("#distraction")).toBeVisible();
    await dock.getByRole("button", { name: "Hide", exact: true }).click();
    await page.locator("#distraction").click();
    const other = await panel.evaluate(() =>
      chrome.runtime.sendMessage({
        type: "add",
        origin: "http://127.0.0.1:5173",
        selector: "#keep",
        label: "Other tab",
      }),
    );
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator("#keep")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Undo", exact: true }),
    ).toBeDisabled();
    await panel.evaluate(
      (id) =>
        chrome.runtime.sendMessage({
          type: "remove",
          origin: "http://127.0.0.1:5173",
          id,
        }),
      other.createdRuleId,
    );
    await expect(page.locator("#keep")).toBeVisible();
    await expect(page.locator("#distraction")).toBeVisible();
    await page.locator("#keep").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#keep")).toBeHidden();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator("#keep")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Done", exact: true }),
    ).toHaveCount(0);
    // Generated IDs must not become persistence anchors when a stable attribute exists.
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await page.locator('[data-testid="volatile"]').click();
    await expect(page.locator('[data-testid="volatile"]')).toBeHidden();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.reload();
    await reopen();
    await expect(page.locator('[data-testid="volatile"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="volatile"]')).toBeHidden();
    await restore();
    await expect(page.locator('[data-testid="volatile"]')).toBeVisible();
    // Product links regenerate search attribution; stable product identity must win.
    await page.evaluate(() => {
      const wrapper = document.createElement("section");
      wrapper.id = "product-fixture";
      wrapper.innerHTML =
        '<article role="listitem" tabindex="0" data-asin="fixture-product"><a href="/product/example?qid=initial&ref=search">Product example</a></article><article role="listitem" data-asin="fixture-neighbor"><a href="/product/neighbor?qid=initial">Neighbor</a></article><article data-asin="fixture-product">Duplicate product faceout</article>';
      document.body.append(wrapper);
    });
    const product = page.locator(
      '[data-asin="fixture-product"][role="listitem"]',
    );
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await product.focus();
    await page.keyboard.press("Enter");
    await expect(product).toBeHidden();
    await page.evaluate(() =>
      document
        .querySelector('[data-asin="fixture-product"] a')
        .setAttribute("href", "/product/example?qid=changed&ref=search"),
    );
    await expect(product).toBeHidden();
    await expect(page.locator('[data-asin="fixture-neighbor"]')).toBeVisible();
    await restore();
    await expect(product).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .locator("#product-fixture")
      .evaluate((element) => element.remove());
    // A semantic landmark must retain its identity when a same-tag sibling is inserted.
    // Failure: a positional selector hides the new sibling and reveals the chosen landmark.
    await page.evaluate(() => {
      const wrapper = document.createElement("section");
      wrapper.id = "landmark-fixture";
      wrapper.innerHTML =
        '<div>Retained wrapper</div><div role="navigation" tabindex="0">Topic navigation</div>';
      document.body.append(wrapper);
    });
    const landmark = page.locator('#landmark-fixture [role="navigation"]');
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await landmark.focus();
    await page.keyboard.press("Enter");
    await expect(landmark).toBeHidden();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.evaluate(() => {
      const newSibling = document.createElement("div");
      newSibling.textContent = "Inserted wrapper";
      document
        .querySelector('#landmark-fixture [role="navigation"]')
        .before(newSibling);
    });
    await expect(landmark).toHaveCount(1);
    await expect(landmark).toBeHidden();
    await expect(
      page.getByText("Inserted wrapper", { exact: true }),
    ).toBeVisible();
    await restore();
    await expect(landmark).toBeVisible();
    await page
      .locator("#landmark-fixture")
      .evaluate((element) => element.remove());
    // The selected story must survive insertion of a different story before it.
    const story = page
      .locator('[data-testid="story"]')
      .filter({ has: page.locator('a[href^="/stories/target?view=full&"]') });
    await dock.locator("#hide").click();
    await expect(
      page.getByRole("region", { name: "Taylr Hide" }),
    ).toBeVisible();
    await story.hover();
    // The link fills only part of the card; click its exposed card padding.
    const storyBox = await story.boundingBox();
    await page.mouse.click(storyBox.x + 4, storyBox.y + 4);
    await expect(story).toBeHidden();

    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.evaluate(() => sessionStorage.setItem("prepend-promotion", "1"));
    await page.reload();
    await expect(story).toHaveCount(1);
    await expect(story).toBeHidden();
    await expect(
      page.locator('a[href^="/stories/target?view=compact&"]'),
    ).toBeVisible();
    await expect(page.locator('a[href="#promotion"]')).toBeVisible();
    await restore();
    await expect(story).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    if (ownsProfile) await restore().catch(() => {});
    await context.tracing.stop({ path: evidencePath("fixture-trace.zip") });
  }
}
