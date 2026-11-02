import { test, expect, type ElementHandle } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// A legitimate held press must survive replacement of a decorative label.
// No second click may compensate for a lost press, and each Save writes once.
test("Save retains a native press while its success label is replaced", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  const origin = "http://127.0.0.1:5173";
  const url = `${origin}/action-button-press`;
  const events: unknown[] = [];
  const writes: { id: string; revision: string; opacity: string }[] = [];
  let savedLabel: ElementHandle<HTMLElement | SVGElement> | null = null;
  await context.exposeBinding("__recordActionPress", (_source, record) => {
    events.push(record);
  });
  await context.exposeBinding("__recordActionWrite", (_source, record) => {
    writes.push(record);
  });
  await context.route(url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Native Save press</title><style>body{padding:70px;font:18px system-ui}article{width:360px;padding:30px;background:#ddd}</style><article id='selected'>Selected card</article>",
    }),
  );
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    await bridge.evaluate((origin) => {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        const profile = changes[`site:${origin}`]?.newValue;
        for (const rule of profile?.rules ?? [])
          if (rule.kind === "edit")
            void (
              window as unknown as Record<
                string,
                (value: unknown) => Promise<void>
              >
            ).__recordActionWrite({
              id: rule.id,
              revision: rule.revision,
              opacity: rule.styles.opacity,
            });
      });
    }, origin);
    const readProfile = () =>
      bridge.evaluate(
        async (origin) =>
          (await chrome.runtime.sendMessage({ type: "get", origin })).profile,
        origin,
      );
    const page = await context.newPage();
    await page.goto(url);
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    await page.locator("#selected").click();
    await dock.locator("#edit-opacity").fill("67");
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#edit-save")).toHaveAttribute(
      "data-state",
      "success",
    );
    await expect(dock.locator("#edit-save")).toHaveAccessibleName("Saved");
    const label = dock
      .locator("#edit-save .arc-action-content > span")
      .filter({ hasText: /^Saved$/ });
    await expect(label).toBeVisible();
    savedLabel = await label.elementHandle();
    expect(savedLabel).not.toBeNull();
    const first = (await readProfile()).rules[0];
    expect(first.styles.opacity).toBe("0.67");
    await expect.poll(() => writes.length).toBe(1);
    await savedLabel.evaluate((node: Element) => {
      const button = node.closest("button")!;
      for (const type of ["pointerdown", "pointerup", "click"])
        button.addEventListener(
          type,
          (event) => {
            const pointer = event as PointerEvent;
            void (
              window as unknown as Record<
                string,
                (value: unknown) => Promise<void>
              >
            ).__recordActionPress({
              type,
              trusted: event.isTrusted,
              at: performance.now(),
              x: pointer.clientX,
              y: pointer.clientY,
              originalLabelConnected: node.isConnected,
              targetIsOriginalLabel: event.target === node,
              targetIsButton: event.target === button,
              path: event
                .composedPath()
                .slice(0, 5)
                .map((part) =>
                  part instanceof Element
                    ? {
                        tag: part.localName,
                        id: part.id,
                        text: part.textContent?.slice(0, 30),
                      }
                    : null,
                ),
            });
          },
          { capture: true, passive: true },
        );
    });
    const box = await savedLabel.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    // Filling starts Saved's ordinary exit; the pointer is already positioned.
    await dock.locator("#edit-opacity").fill("73");
    await page.mouse.down();
    await expect
      .poll(() => savedLabel.evaluate((node: Element) => node.isConnected))
      .toBe(false);
    await page.mouse.up();
    await expect
      .poll(async () => (await readProfile()).rules[0]?.revision)
      .not.toBe(first.revision);
    const profile = await readProfile();
    expect(profile.rules).toHaveLength(1);
    expect(profile.rules[0]).toMatchObject({
      id: first.id,
      styles: { opacity: "0.73" },
    });
    await expect(page.locator("#selected")).toHaveCSS("opacity", "0.73");
    await expect.poll(() => writes.length).toBe(2);
    expect(writes.map((write) => write.id)).toEqual([first.id, first.id]);
    expect(new Set(writes.map((write) => write.revision)).size).toBe(2);
    expect(writes.map((write) => write.opacity)).toEqual(["0.67", "0.73"]);
    expect(events).toMatchObject([
      { type: "pointerdown", trusted: true, originalLabelConnected: true },
      { type: "pointerup", trusted: true, originalLabelConnected: false },
      { type: "click", trusted: true, originalLabelConnected: false },
    ]);
  } finally {
    await test.info().attach("native-action-press", {
      body: JSON.stringify({ events, writes }, null, 2),
      contentType: "application/json",
    });
    await savedLabel?.dispose();
    await context.tracing.stop({
      path: evidencePath("action-button-press.zip"),
    });
    await instance.close();
  }
});
