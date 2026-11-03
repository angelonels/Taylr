import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// A declared optional control may appear late in its presence window. Its
// trusted native click still owns an action budget within the overall visit.
// It appears 9s into the 10s window: late, yet with headroom for a loaded CPU,
// where Playwright's own reaction takes about 0.3s.
test("Late optional dismissal preserves native action time and the full component journey", async () => {
  const site = {
    id: "late-dismiss",
    caseId: "primary",
    component: "Card behind an optional notice",
    url: "http://127.0.0.1:5173/late-dismiss",
    target: "#selected",
    keep: "#kept",
    dismiss: "#dismiss",
  };
  const instance = await isolatedBrowser(site);
  const witnesses: {
    visit: number;
    stage: string;
    trusted?: boolean;
    at: number;
  }[] = [];
  let visits = 0;
  await instance.context.exposeBinding(
    "__recordDismiss",
    (_source, witness: (typeof witnesses)[number]) => witnesses.push(witness),
  );
  await instance.context.route(site.url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Optional notice</title><style>body{padding:40px;font:18px system-ui}article{width:420px;padding:25px;background:#ddd}aside{margin-top:180px}#notice{position:fixed;inset:0;background:#ffffffed;z-index:10}#dismiss{position:absolute;top:100px;left:100px;padding:18px}</style><main><article id="selected">Selected card</article><aside id="kept">Independent content</aside></main><script>
const visit=${++visits};
function record(stage,event){void window.__recordDismiss({visit,stage,trusted:event?.isTrusted,at:performance.now()});}
setTimeout(()=>{
 const notice=document.createElement('div');notice.id='notice';notice.setAttribute('role','dialog');notice.setAttribute('aria-label','Optional notice');
 const close=document.createElement('button');close.id='dismiss';close.textContent='Close';notice.append(close);document.body.append(notice);record('visible');
 close.addEventListener('pointerdown',event=>{record('pointerdown',event);const end=performance.now()+650;while(performance.now()<end){}record('pointerdown-complete',event);},{once:true});
 close.addEventListener('click',event=>{record('click',event);notice.remove();record('removed',event);},{once:true});
},9000);
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
    expect(visits).toBe(4);
    for (let visit = 1; visit <= visits; visit++) {
      const events = witnesses.filter((witness) => witness.visit === visit);
      expect(events.map((event) => event.stage)).toEqual([
        "visible",
        "pointerdown",
        "pointerdown-complete",
        "click",
        "removed",
      ]);
      expect(events[0].at).toBeGreaterThanOrEqual(9000);
      expect(events[2].at - events[1].at).toBeGreaterThanOrEqual(650);
      expect(events.filter((event) => event.trusted === true)).toHaveLength(4);
    }
  } finally {
    await test.info().attach("native-dismiss-witnesses", {
      body: JSON.stringify({ visits, witnesses }, null, 2),
      contentType: "application/json",
    });
    await instance.close();
  }
});
