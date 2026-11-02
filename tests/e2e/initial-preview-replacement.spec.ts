import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

for (const stage of ["reset", "save"] as const) {
  for (const kind of ["replace", "connected-wrong"] as const) {
    test(`Initial preview reacquires only a disconnected declared component: ${stage}/${kind}`, async () => {
      const site = {
        id: `initial-preview-${stage}-${kind}`,
        caseId: "primary",
        component: "Article replaced during first draft",
        url: `http://127.0.0.1:5173/initial-preview-${stage}-${kind}`,
        target: "#selected",
        keep: "#kept",
      };
      const instance = await isolatedBrowser(site);
      const saveEvents: unknown[] = [];
      await instance.context.exposeBinding(
        "__recordInitialSave",
        (_source, witness) => saveEvents.push(witness),
      );
      const witnesses: {
        oldConnected: boolean;
        declaredIsOld: boolean;
        count: number;
        saves: number;
        radiusInputs: number;
        rules: unknown[];
      }[] = [];
      await instance.context.exposeBinding(
        "__recordInitialReplacement",
        async (_source, witness) => {
          const stored = await instance.worker.evaluate(
            async (origin) =>
              (await chrome.storage.local.get("site:" + origin))[
                "site:" + origin
              ],
            new URL(site.url).origin,
          );
          witnesses.push({ ...witness, rules: stored?.rules ?? [] });
        },
      );
      await instance.context.route(site.url, (route) =>
        route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><title>Initial preview replacement</title><style>body{padding:40px}article{width:420px;padding:25px;margin:20px;background:#ddd}</style><main><article id="selected">Selected card</article><aside id="kept">Independent content</aside></main><script>
let fired=false,saves=0,hooked=false,radiusInputs=0;
window.addEventListener('click',event=>{if(event.isTrusted&&event.composedPath().some(node=>node.id==='edit-save')){saves++;void window.__recordInitialSave({saves,at:performance.now()});}},true);
function hook(){const root=document.querySelector('taylr-tools')?.shadowRoot;if(!root||hooked)return;hooked=true;root.addEventListener('input',event=>{if(fired||!event.isTrusted||event.target.id!=='edit-border-radius'||event.target.value!=='17px')return;radiusInputs++;if(radiusInputs!==${stage === "reset" ? 1 : 3})return;fired=true;queueMicrotask(()=>{const original=document.getElementById('selected'),next=original.cloneNode(true);${kind === "replace" ? "original.replaceWith(next);" : "original.id='old-selected';original.after(next);"}void window.__recordInitialReplacement({oldConnected:original.isConnected,declaredIsOld:document.querySelector('#selected')===original,count:document.querySelectorAll('#selected').length,saves,radiusInputs});});},true);}
new MutationObserver(hook).observe(document.documentElement,{childList:true,subtree:true});hook();
</script>`,
        }),
      );
      try {
        const result = await runLiveSite(
          instance.context,
          instance.extensionId,
          site,
        ).then(
          (value) => value,
          (error: unknown) => error,
        );
        expect(witnesses).toHaveLength(1);
        expect(witnesses[0]).toEqual({
          oldConnected: kind !== "replace",
          declaredIsOld: false,
          count: 1,
          saves: 0,
          radiusInputs: stage === "reset" ? 1 : 3,
          rules: [],
        });
        if (kind === "replace")
          expect(result).toMatchObject({ outcome: "passed" });
        else {
          expect(result).toMatchObject({
            outcome: "product-failed",
            phase: "edit",
          });
          const page = instance.context
            .pages()
            .find((page) => page.url() === site.url)!;
          expect(
            await page
              .locator("#old-selected")
              .evaluate((element) => element.isConnected),
          ).toBe(true);
          await expect(page.locator("#kept")).toBeVisible();
          // The negative must stop before any Save, not pass on a later editor error.
          expect(saveEvents).toHaveLength(0);
        }
      } finally {
        await test.info().attach("initial-preview-replacement", {
          body: JSON.stringify({ stage, kind, witnesses, saveEvents }, null, 2),
          contentType: "application/json",
        });
        await instance.close();
      }
    });
  }
}
