import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Failure hypothesis: native hydration replaces a uniquely identified component
// between locator resolution and the saved-rule/current-node identity assertion.
test("Catalog identity survives a bounded native hydration burst on revisit", async () => {
  const site = {
    id: "hydration-identity",
    caseId: "primary",
    component: "Hydrated card",
    url: "http://127.0.0.1:5173/hydration-identity",
    target: "#selected",
    keep: "#kept",
  };
  const instance = await isolatedBrowser(site);
  let visits = 0;
  const mutations: {
    visit: number;
    count: number;
    oldConnected: boolean;
    newConnected: boolean;
  }[] = [];
  // The binding belongs to the context, so reloads and new tabs cannot erase proof.
  await instance.context.exposeBinding(
    "__recordHydrationMutation",
    (_source, witness: (typeof mutations)[number]) => mutations.push(witness),
  );
  await instance.context.route(site.url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Hydration identity</title><style>body{padding:40px}article{display:block;width:420px;padding:25px;margin:20px;background:#ddd}</style><main><section><article id="selected"><span>Selected card</span></article><article id="kept"><span>Independent card</span></article></section></main>${++visits > 1 ? `<script>const end=performance.now()+400;let count=0;const hydration=setInterval(()=>{const card=document.getElementById('selected');const replacement=card.cloneNode(true);card.replaceWith(replacement);count++;if(count===1)window.__recordHydrationMutation({visit:${visits},count,oldConnected:card.isConnected,newConnected:replacement.isConnected});if(performance.now()>end)clearInterval(hydration);},4);</script>` : ""}`,
    }),
  );
  try {
    const result = await runLiveSite(
      instance.context,
      instance.extensionId,
      site,
    );
    expect(visits).toBeGreaterThan(1);
    await expect.poll(() => mutations.length).toBeGreaterThan(0);
    for (const witness of mutations) {
      expect(witness.visit).toBeGreaterThan(1);
      expect(witness.count).toBeGreaterThan(0);
      expect(witness.oldConnected).toBe(false);
      expect(witness.newConnected).toBe(true);
    }
    await test.info().attach("hydration-mutations", {
      body: JSON.stringify({ visits, mutations }),
      contentType: "application/json",
    });
    expect(result.outcome).toBe("passed");
  } finally {
    await instance.close();
  }
});
