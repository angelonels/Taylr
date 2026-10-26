import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Failure contract: Native scroll safe-area changes on an oversized pane must not invalidate
// an exposed viewport point through a second implicit locator-action scroll.
test("Full journey selects an exposed oversized pane when a later scroll changes its hit point", async () => {
  const site = {
    id: "viewport-pointer",
    caseId: "primary",
    component: "Oversized filter pane",
    url: "http://127.0.0.1:5173/viewport-pointer",
    target: "#selected",
    keep: "#kept",
  };
  const instance = await isolatedBrowser(site);
  const observations: {
    event: string;
    scrollTop: number;
    top: number;
    height: number;
    hitInside?: boolean;
    x?: number;
    y?: number;
  }[] = [];
  await instance.context.exposeBinding("__recordPane", (_source, value) => {
    if (observations.length < 120) observations.push(value);
  });
  await instance.context.route(site.url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Oversized scroll pane</title><style>
      body{margin:0;font:16px system-ui}
      #scroller{position:fixed;inset:0 auto 0 0;width:320px;overflow-y:auto;scroll-padding-top:0}
      #spacer{height:2000px}
      #selected{width:300px;height:3952px;background:#dde5ee}
      #header{position:fixed;left:0;top:0;width:320px;height:12px;background:#aaa;z-index:2}
      #decoy{position:fixed;left:0;top:28px;bottom:0;width:320px;background:#ddd;z-index:2}
      #kept{position:fixed;left:360px;top:120px;padding:25px;background:#eee}
    </style><div id="scroller"><div id="spacer"></div><article id="selected"><span>Filter categories</span></article></div><header id="header">Sticky header</header><div id="decoy">Independent overlay: the pane remains reachable in the band above.</div><aside id="kept">Keep independent content</aside><script>
      const pane=document.getElementById('selected'),scroller=document.getElementById('scroller');
      function record(event,point){const r=pane.getBoundingClientRect();void window.__recordPane({event,scrollTop:scroller.scrollTop,top:r.top,height:r.height,...point});}
      scroller.addEventListener('scroll',()=>record('native-scroll'),{passive:true});
      // A page can update native scroll safe-area policy without moving the
      // currently exposed component. Only a later automatic scroll uses it.
      pane.addEventListener('pointerenter',()=>{scroller.style.scrollPaddingTop='300px';record('safe-area-change');},{once:true,passive:true});
      pane.addEventListener('pointermove',event=>{const point={x:event.clientX,y:event.clientY};record('pointer-hit',{...point,hitInside:pane.contains(document.elementFromPoint(point.x,point.y))});},{passive:true});
      window.addEventListener('pointerdown',event=>{if(event.clientX<320)record('trusted-press',{x:event.clientX,y:event.clientY,hitInside:pane.contains(event.target),trusted:event.isTrusted,target:event.target.id});},true);
    </script>`,
    }),
  );
  try {
    const result = await runLiveSite(
      instance.context,
      instance.extensionId,
      site,
    );
    expect(result.outcome).toBe("passed");
    expect(result.checks).toHaveLength(6);
    expect(
      observations.some(
        (value) => value.event === "pointer-hit" && value.hitInside,
      ),
    ).toBe(true);
    expect(
      observations.some((value) => value.event === "safe-area-change"),
    ).toBe(true);
    expect(
      observations.some(
        (value) => value.event === "native-scroll" && value.scrollTop > 0,
      ),
    ).toBe(true);
    const presses = observations.filter(
      (value) => value.event === "trusted-press",
    );
    expect(presses.length).toBeGreaterThan(0);
    for (const press of presses) {
      expect(press.hitInside).toBe(true);
      const sample = observations
        .slice(0, observations.indexOf(press))
        .findLast((value) => value.event === "pointer-hit" && value.hitInside);
      expect(sample).toBeDefined();
      expect(press.x).toBeCloseTo(sample!.x!, 1);
      expect(press.y).toBeCloseTo(sample!.y!, 1);
    }
    for (const page of instance.context
      .pages()
      .filter((page) => page.url() === site.url)) {
      await expect(page.locator("#kept")).toBeVisible();
      await expect(page.locator("#kept")).toHaveText(
        "Keep independent content",
      );
      await expect(page.locator("#kept")).not.toHaveAttribute("style");
    }
  } finally {
    await test.info().attach("native-pane-geometry", {
      body: JSON.stringify(observations, null, 2),
      contentType: "application/json",
    });
    await instance.close();
  }
});
