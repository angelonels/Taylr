import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure: textContent destroys framework-owned text fragments/comments, and
// cancellation overwrites an app replacement which happens to have the same text.
for (const replacement of [false, true]) {
  test(`Text ownership preserves ${replacement ? "site replacement" : "fragments and comments"}`, async () => {
    const instance = await isolatedBrowser();
    const { context, extensionId } = instance;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    await context.route("http://127.0.0.1:5173/text-ownership", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><style>body{padding:80px}button{padding:30px}</style><button id="selected">Hello<!--site marker--> world</button>',
      }),
    );
    try {
      const bridge = await driver(context, extensionId),
        page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/text-ownership");
      const target = page.locator("#selected");
      await target.evaluate((element) => {
        (globalThis as typeof globalThis & { ownedNodes: Node[] }).ownedNodes =
          [...element.childNodes];
      });
      const dock = await openDock(context, bridge, page);
      await startEdit(dock);
      await target.click();
      await dock.locator("#edit-text").fill("Edited");
      await expect(target).toHaveText("Edited");
      if (replacement)
        await target.evaluate((element) => {
          const node = document.createTextNode("Edited");
          element.replaceChildren(node);
          (
            globalThis as typeof globalThis & { replacement: Node }
          ).replacement = node;
        });
      else
        expect(
          await target.evaluate((element) =>
            (
              globalThis as typeof globalThis & { ownedNodes: Node[] }
            ).ownedNodes.every(
              (node, index) => element.childNodes[index] === node,
            ),
          ),
        ).toBe(true);
      await page.keyboard.press("Escape");
      await expect(target).toHaveText(replacement ? "Edited" : "Hello world");
      if (replacement)
        expect(
          await target.evaluate(
            (element) =>
              element.firstChild ===
              (globalThis as typeof globalThis & { replacement: Node })
                .replacement,
          ),
        ).toBe(true);
      else
        expect(
          await target.evaluate((element) =>
            (
              globalThis as typeof globalThis & { ownedNodes: Node[] }
            ).ownedNodes.map((node, index) => ({
              same: element.childNodes[index] === node,
              value: node.nodeValue,
            })),
          ),
        ).toEqual([
          { same: true, value: "Hello" },
          { same: true, value: "site marker" },
          { same: true, value: " world" },
        ]);
    } finally {
      await context.tracing.stop({
        path: evidencePath(`text-ownership-${replacement}.zip`),
      });
      await instance.close();
    }
  });
}

// Failure: an edit resave moves a legacy display declaration after Hide, or a
// more specific legacy selector outranks Hide despite representing the same box.
test("Hide outranks legacy display edits regardless of save order or specificity", async () => {
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
    await openDock(context, bridge, page);
    const send = (message) =>
      bridge.evaluate(
        (message) =>
          chrome.runtime.sendMessage({
            origin: "http://127.0.0.1:5173",
            ...message,
          }),
        message,
      );
    await send({
      type: "edit",
      selector: "article#keep",
      label: "Kept",
      styles: { display: "block", color: "#2176ff" },
    });
    const hidden = await send({
      type: "add",
      selector: "#keep",
      label: "Kept",
    });
    await expect(page.locator("#keep")).toBeHidden();
    await send({
      type: "edit",
      selector: "article#keep",
      label: "Kept",
      styles: { opacity: "0.5" },
    });
    await expect(page.locator("#keep")).toBeHidden();
    await send({ type: "remove", id: hidden.createdRuleId });
    await expect(page.locator("#keep")).toBeVisible();
    await expect(page.locator("#keep")).toHaveCSS("opacity", "0.5");
    await expect(page.locator("#keep")).toHaveCSS("color", "rgb(33, 118, 255)");
  } finally {
    await context.tracing.stop({
      path: evidencePath("hide-display-precedence.zip"),
    });
    await instance.close();
  }
});

// Failure: a newly appended child makes a former leaf ineligible for text edits;
// restoration must still release the exact text nodes Taylr owns.
test("Text ownership restores words when a site appends a child", async () => {
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
    const target = page.locator("#keep");
    const original = await target.textContent();
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    await target.click();
    await dock.locator("#edit-text").fill("Temporary words");
    await expect(target).toHaveText("Temporary words");
    await target.evaluate((element) => {
      const child = document.createElement("button");
      child.id = "new-site-child";
      child.textContent = "Action";
      element.append(child);
    });
    await page.keyboard.press("Escape");
    await expect(target).toHaveText(`${original}Action`);
    await expect(page.locator("#new-site-child")).toBeVisible();
  } finally {
    await context.tracing.stop({
      path: evidencePath("text-appended-child-trace.zip"),
    });
    await instance.close();
  }
});
