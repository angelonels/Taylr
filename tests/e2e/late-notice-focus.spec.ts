import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// A delayed nonmodal page notice may take focus while a native Select is open.
// Closing that notice and reopening the Select must preserve the editing draft.
test("Late notice focus dismisses Select and permits explicit draft recovery", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  const focusEvents: unknown[] = [];
  await context.exposeBinding("__recordNoticeFocus", (_source, witness) =>
    focusEvents.push(witness),
  );
  await context.route("http://127.0.0.1:5173/late-notice", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><style>body{font:18px system-ui;padding:50px}#selected,#kept{display:block;padding:30px;width:400px;margin:30px}#notice{position:fixed;bottom:0;left:0;background:white;padding:20px;z-index:100}</style><input id="selected" value="Editable search"><aside id="kept">Independent content</aside><div id="notice" role="dialog" aria-label="Privacy" tabindex="0" hidden>Privacy notice<button id="notice-close" onclick="this.parentElement.hidden=true">Close</button></div><script>
const original=document.querySelector('#selected');let fired=false;let originalHost;
window.addEventListener('click', event=>{
  if(fired||!event.isTrusted||!event.composedPath().some(node=>node.id==='edit-font-weight'))return;
  fired=true;originalHost=document.querySelector('taylr-tools');
  setTimeout(()=>{const notice=document.querySelector('#notice');notice.hidden=false;notice.addEventListener('focusin',event=>window.__recordNoticeFocus({trusted:event.isTrusted,selectedConnected:original.isConnected,hostConnected:originalHost.isConnected,noticeFocused:document.activeElement===notice}),{once:true});notice.focus();},100);
},true);
</script>`,
    }),
  );
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/late-notice");
    const original = await page.locator("#selected").elementHandle();
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    await page.locator("#selected").click();
    await dock.locator("#edit-opacity").fill("67");
    await expect(page.locator("#selected")).toHaveCSS("opacity", "0.67");
    await dock.locator("#edit-font-weight").click();
    await expect.poll(() => focusEvents.length).toBe(1);
    expect(focusEvents).toEqual([
      {
        trusted: true,
        selectedConnected: true,
        hostConnected: true,
        noticeFocused: true,
      },
    ]);
    await expect(dock.locator("#edit-font-weight")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(dock.locator('[role="option"][data-value="600"]')).toHaveCount(
      0,
    );
    await expect(dock.locator("#edit-opacity")).toHaveValue("67");
    // Locked picking blocks page pointer activation. Native keyboard activation
    // of the focused notice control remains available without discarding draft.
    await page.getByRole("button", { name: "Close", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#notice")).toBeHidden();
    await dock.locator("#edit-font-weight").click();
    await dock.locator('[role="option"][data-value="600"]').click();
    await dock.locator("#edit-save").click();
    await expect(page.locator("#selected")).toHaveCSS("opacity", "0.67");
    await expect(page.locator("#selected")).toHaveCSS("font-weight", "600");
    await expect(page.locator("#kept")).toHaveCSS("opacity", "1");
    expect(
      await original!.evaluate(
        (element) =>
          element === document.querySelector("#selected") &&
          element.isConnected,
      ),
    ).toBe(true);
    expect(page.url()).toBe("http://127.0.0.1:5173/late-notice");
    await test.info().attach("late-notice-focus", {
      body: JSON.stringify(focusEvents),
      contentType: "application/json",
    });
  } finally {
    await context.tracing.stop({ path: evidencePath("late-notice-focus.zip") });
    await instance.close();
  }
});
