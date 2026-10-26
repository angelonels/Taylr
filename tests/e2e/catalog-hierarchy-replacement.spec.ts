import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Failure hypothesis: a framework replacement during hierarchy refinement
// detaches the selected node while the same declared component remains present.
for (const action of ["Parent", "Child", "connected-wrong"] as const) {
  test(`Catalog hierarchy reacquires only after replacement during ${action}`, async () => {
    const command = action === "connected-wrong" ? "Parent" : action;
    const mutation =
      action === "connected-wrong"
        ? "document.getElementById('other').append(document.getElementById('selected'));document.documentElement.dataset.connectedWrong='true';"
        : "const group=document.getElementById('group');group.replaceWith(group.cloneNode(true));window.__recordHierarchyReplacement(!group.isConnected);";
    const schedule =
      action === "connected-wrong" ? "setTimeout" : "queueMicrotask";
    const site = {
      id: `hierarchy-replacement-${action.toLowerCase()}`,
      caseId: "primary",
      component: "Replaceable card",
      url: `http://127.0.0.1:5173/hierarchy-replacement-${action.toLowerCase()}`,
      target: "#selected",
      keep: "#kept",
    };
    const instance = await isolatedBrowser(site);
    let replacements = 0;
    await instance.context.exposeBinding(
      "__recordHierarchyReplacement",
      (_source, disconnected: boolean) => {
        expect(disconnected).toBe(true);
        replacements++;
      },
    );
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Hierarchy replacement</title><style>body{padding:40px}section,article{display:block;padding:25px;margin:20px;background:#ddd}article{width:420px}</style><main><section id="group"><article id="selected"><span>Selected card</span></article></section><section id="other"></section><aside id="kept">Independent content</aside></main><script>let replaced=false;window.addEventListener('click',event=>{if(replaced||!event.composedPath().some(node=>node.getAttribute?.('aria-label')===${JSON.stringify(command)}||node.textContent?.trim()===${JSON.stringify(command)}))return;replaced=true;${schedule}(()=>{${mutation}});},true);</script>`,
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
      if (action === "connected-wrong") {
        expect(result).toMatchObject({
          outcome: "product-failed",
          phase: "edit",
        });
        const page = instance.context
          .pages()
          .find((page) => page.url() === site.url)!;
        expect(
          await page.evaluate(() => ({
            triggered: document.documentElement.dataset.connectedWrong,
            targetConnected: document.getElementById("selected")!.isConnected,
            parent: document.getElementById("selected")!.parentElement!.id,
            oldParentConnected: document.getElementById("group")!.isConnected,
          })),
        ).toEqual({
          triggered: "true",
          targetConnected: true,
          parent: "other",
          oldParentConnected: true,
        });
      } else {
        expect(result).toMatchObject({ outcome: "passed" });
        expect(replacements).toBeGreaterThan(0);
      }
    } finally {
      await instance.close();
    }
  });
}
