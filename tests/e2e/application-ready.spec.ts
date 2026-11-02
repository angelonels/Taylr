import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Native engine readiness is separate from unchanged component uniqueness and
// editor action budgets. A splash disappearing alone is not positive readiness.
for (const scenario of [
  "delayed-engine",
  "missing-component",
  "access-wall",
] as const) {
  test(`Application readiness: ${scenario}`, async () => {
    const site = {
      id: `app-ready-${scenario}`,
      caseId: "primary",
      component: "Native application component",
      url: `http://127.0.0.1:5173/app-ready-${scenario}`,
      readySelector: "#applet",
      target: "#applet #selected",
      keep: "#applet #kept",
    };
    const instance = await isolatedBrowser(site);
    const witnesses: {
      document: number;
      root: boolean;
      component: boolean;
      delay: number;
    }[] = [];
    await instance.context.exposeBinding(
      "__recordApplicationReady",
      (_source, witness) => witnesses.push(witness),
    );
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        status: scenario === "access-wall" ? 403 : 200,
        contentType: "text/html",
        body:
          scenario === "access-wall"
            ? "<!doctype html><title>Security check</title><main>Access denied by upstream security gateway</main>"
            : `<!doctype html><title>Native application readiness</title><style>body{padding:70px;font:18px system-ui}article,aside{padding:30px;margin:20px;background:#eee}</style><div id="splash">Starting application engine</div><script>
          const started=performance.now();
          setTimeout(()=>{
            const root=document.createElement('main');root.id='applet';
            root.innerHTML=${JSON.stringify(`${scenario === "delayed-engine" ? '<article id="selected"><span>Native component</span></article>' : ""}<aside id="kept">Independent native content</aside>`)};
            document.getElementById('splash').replaceWith(root);
            void window.__recordApplicationReady({document:performance.timeOrigin,root:!!document.querySelector('#applet'),component:!!document.querySelector('#applet #selected'),delay:performance.now()-started});
          },${scenario === "delayed-engine" ? 16000 : 0});
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
        (cause: unknown) => cause,
      );
      if (scenario === "delayed-engine") {
        expect(result).toMatchObject({ outcome: "passed", phase: "complete" });
        // Initial visit, reload, new tab, and Restore's final reload all require
        // the same positive native root before exercising the original target.
        expect(new Set(witnesses.map((value) => value.document)).size).toBe(4);
        expect(witnesses).toHaveLength(4);
        for (const witness of witnesses) {
          expect(witness.root).toBe(true);
          expect(witness.component).toBe(true);
          expect(witness.delay).toBeGreaterThan(15000);
        }
      } else if (scenario === "missing-component") {
        expect(result).toMatchObject({
          outcome: "contract-failed",
          phase: "baseline",
        });
        expect(witnesses).toHaveLength(1);
        expect(witnesses[0]).toMatchObject({ root: true, component: false });
        const page = instance.context
          .pages()
          .find((page) => page.url() === site.url)!;
        await expect(page.locator(site.readySelector)).toHaveCount(1);
        await expect(page.locator(site.target)).toHaveCount(0);
        await expect(page.locator(site.keep)).toBeVisible();
      } else {
        expect(result).toMatchObject({
          outcome: "blocked",
          phase: "navigation",
        });
        expect(witnesses).toHaveLength(0);
      }
    } finally {
      await test.info().attach("native-initialization-witnesses", {
        body: JSON.stringify(witnesses, null, 2),
        contentType: "application/json",
      });
      await instance.close();
    }
  });
}
