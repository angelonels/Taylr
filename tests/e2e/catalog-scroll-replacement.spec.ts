import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Failure contracts: the native scroll action loses its node while waiting for
// app motion to settle; a still-connected unusable node must not be retried away.
for (const mutation of ["replace", "hide-connected"] as const) {
  test(`Catalog scroll handles only proven replacement: ${mutation}`, async () => {
    const site = {
      id: `scroll-${mutation}`,
      caseId: "primary",
      component: "Moving card",
      url: `http://127.0.0.1:5173/scroll-${mutation}`,
      target: "#selected",
      keep: "#kept",
    };
    const instance = await isolatedBrowser(site);
    const observedMutations: string[] = [];
    await instance.context.exposeBinding(
      "__recordScrollMutation",
      (_source, value: string) => observedMutations.push(value),
    );
    const change =
      mutation === "replace"
        ? "const replacement=target.cloneNode(true);replacement.classList.remove('hydrating');target.replaceWith(replacement);"
        : "target.hidden=true;target.classList.remove('hydrating');";
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Scroll replacement</title><style>body{padding:40px}article{width:430px;padding:30px;background:#ddd;margin-top:1500px}.hydrating{animation:hydrating .9s linear infinite}@keyframes hydrating{from{transform:translateX(0)}to{transform:translateX(20px)}}</style><aside id="kept">Independent content</aside><main><section><article id="selected"><span>Selected card</span></article></section></main><script>let scheduled=false;window.addEventListener('click',event=>{if(scheduled||!event.composedPath().some(node=>node.id==='edit'))return;scheduled=true;const target=document.getElementById('selected');target.classList.add('hydrating');setTimeout(()=>{${change}document.documentElement.dataset.scrollMutation=${JSON.stringify(mutation)};void window.__recordScrollMutation(${JSON.stringify(mutation)});},250);},true);</script>`,
      }),
    );
    try {
      const result = await runLiveSite(
        instance.context,
        instance.extensionId,
        site,
      ).then(
        (value) => value,
        (cause: unknown) => cause,
      );
      const page = instance.context
        .pages()
        .find((page) => page.url() === site.url)!;
      // The positive journey reloads: retain the actual mutation across documents.
      expect(observedMutations).toContain(mutation);
      if (mutation === "replace")
        expect(result).toMatchObject({ outcome: "passed" });
      else {
        expect(result).toMatchObject({
          outcome: "product-failed",
          phase: "edit",
        });
        expect(String((result as Error).message)).toContain(
          "scrollIntoViewIfNeeded",
        );
        expect(
          await page
            .locator("#selected")
            .evaluate((element) => element.isConnected),
        ).toBe(true);
        await expect(page.locator("#kept")).toBeVisible();
      }
    } finally {
      await instance.close();
    }
  });
}
