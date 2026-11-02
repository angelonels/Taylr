import { test, expect, type Page } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// A native page toggle during a real toolbar press must not swallow activation.
for (const action of ["site-toggle", "edit-save"] as const) {
  for (const toggle of ["none", "details", "popover"] as const) {
    test(`Toolbar press survives native overlay: ${action}/${toggle}`, async () => {
      const instance = await isolatedBrowser();
      const { context, extensionId } = instance;
      const url = "http://127.0.0.1:5173/toolbar-press-overlay";
      const ring: Record<string, unknown>[] = [];
      let page: Page | undefined;
      let profileWitness: unknown;
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      });
      await context.exposeBinding("__recordToolbarPress", (_source, value) => {
        if (ring.length < 40) ring.push(value);
      });
      try {
        await context.route(url, (route) =>
          route.fulfill({
            contentType: "text/html",
            body: `<!doctype html><title>Toolbar native press</title><style>body{padding:70px}#selected,#kept{display:block;width:260px;padding:25px;margin:20px}#native-popover{position:fixed;inset:20px auto auto 420px;width:100px;height:40px}</style><button id="selected">Selected component</button><aside id="kept">Independent content</aside><details id="native-details"><summary>Page details</summary><p>Native page content</p></details><div popover="manual" id="native-popover">Page popover</div><script>
            window.__pressAction=null;let toggled=false;
            for(const type of ['pointerdown','pointerup','click'])window.addEventListener(type,event=>{
              if(!window.__pressAction)return;
              const path=event.composedPath().filter(node=>node instanceof Element).map(node=>node.id||node.localName);
              const host=document.querySelector('taylr-tools');const button=host?.shadowRoot?.querySelector('#'+window.__pressAction);
              const bounds=()=>{const r=button?.getBoundingClientRect();return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
              const before=bounds(),active=()=>host?.shadowRoot?.activeElement?.id||document.activeElement?.localName;
              if(type==='pointerdown'&&!toggled&&path.includes(window.__pressAction)){
                toggled=true;
                ${toggle === "details" ? "document.getElementById('native-details').open=true;" : toggle === "popover" ? "document.getElementById('native-popover').showPopover();" : ""}
              }
              setTimeout(()=>{void window.__recordToolbarPress({event:type,trusted:event.isTrusted,path,defaultPrevented:event.defaultPrevented,active:active(),hostPopover:host?.matches(':popover-open'),before,after:bounds(),toggle:${JSON.stringify(toggle)},toggled});},0);
            },true);
          </script>`,
          }),
        );
        const bridge = await driver(context, extensionId);
        page = await context.newPage();
        await page.goto(url);
        const dock = await openDock(context, bridge, page);
        if (action === "edit-save") {
          await startEdit(dock);
          await page.locator("#selected").click();
          await dock.locator("#edit-opacity").fill("67");
          await expect(page.locator("#selected")).toHaveCSS("opacity", "0.67");
        } else
          await expect(dock.locator("#site-toggle")).toHaveAttribute(
            "aria-expanded",
            "false",
          );
        await page.evaluate((id) => {
          (window as unknown as { __pressAction: string }).__pressAction = id;
        }, action);
        await dock.locator(`#${action}`).click();
        if (action === "site-toggle") {
          await expect(dock.locator("#site-toggle")).toHaveAttribute(
            "aria-expanded",
            "true",
          );
          await expect(dock.locator("#site-pause")).toBeVisible();
        } else {
          await expect
            .poll(async () => {
              const result = await bridge.evaluate(() =>
                chrome.runtime.sendMessage({
                  type: "get",
                  origin: "http://127.0.0.1:5173",
                }),
              );
              profileWitness = result.profile;
              return result.profile.rules.length;
            })
            .toBe(1);
          const profile = profileWitness as {
            rules: { kind: string; selector: string; styles: object }[];
          };
          expect(profile.rules[0].kind).toBe("edit");
          expect(profile.rules[0].styles).toEqual({ opacity: "0.67" });
          expect(
            await page.locator("#selected").evaluate((element, selector) => {
              const matches = document.querySelectorAll(selector);
              return matches.length === 1 && matches[0] === element;
            }, profile.rules[0].selector),
          ).toBe(true);
          await expect(dock.locator("#status")).toHaveText("Changes saved.");
          await expect(dock.locator("#undo")).toBeEnabled();
        }
        await expect
          .poll(() => ring.filter((value) => value.event === "click").length)
          .toBe(1);
        for (const type of ["pointerdown", "pointerup", "click"]) {
          const record = ring.find((value) => value.event === type)!;
          expect(record).toBeDefined();
          expect(record.trusted).toBe(true);
          expect(record.path).toContain(action);
          expect(record.hostPopover).toBe(true);
        }
        if (toggle === "details")
          await expect(page.locator("#native-details")).toHaveAttribute(
            "open",
            "",
          );
        if (toggle === "popover")
          expect(
            await page
              .locator("#native-popover")
              .evaluate((element) => element.matches(":popover-open")),
          ).toBe(true);
        await expect(page.locator("#kept")).toBeVisible();
        await expect(page.locator("#kept")).toHaveCSS("opacity", "1");
      } finally {
        try {
          await test.info().attach("trusted-toolbar-press", {
            body: JSON.stringify({ ring, profileWitness }, null, 2),
            contentType: "application/json",
          });
          if (page && !page.isClosed())
            await page.screenshot({
              path: evidencePath(`toolbar-press-${action}-${toggle}.png`),
            });
        } finally {
          try {
            await context.tracing.stop({
              path: evidencePath(`toolbar-press-${action}-${toggle}.zip`),
            });
          } finally {
            await instance.close();
          }
        }
      }
    });
  }
}
