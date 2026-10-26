import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Failure first: a later card repeats a permalink through a different ownership
// chain. The saved row must stay unique while intact cards move between scopes.
test("Selector identity retains link ownership when another section repeats a story", async () => {
  const site = {
    id: "link-ownership",
    caseId: "primary",
    component: "Story publisher row",
    url: "http://127.0.0.1:5173/link-ownership",
    target: 'div:text-is("Selected row")',
    keep: 'div:text-is("Neighbor row")',
  };
  const instance = await isolatedBrowser(site);
  let visits = 0;
  await instance.context.route(site.url, (route) => {
    const revisit = ++visits > 1;
    const selected =
      '<feed-card><div><div>Selected row</div><span><a href="/story/alpha">Story</a></span></div></feed-card>';
    const neighbor =
      '<feed-card><div><div>Neighbor row</div><span><a href="/story/beta">Other story</a></span></div></feed-card>';
    const repeated =
      '<feed-card><div><div>Repeated resource row</div><div><span><div><a href="/story/alpha">Story elsewhere</a></div></span></div></div></feed-card>';
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Repeated story ownership</title><style>body{padding:30px}feed-card{display:block;width:480px;margin:24px;padding:24px;background:#ddd}feed-card>div>div:first-child{padding:20px}</style><main><section>${revisit ? neighbor : selected + neighbor}</section><section>${revisit ? selected + repeated : ""}</section></main><script>let added=${revisit};window.addEventListener('click',event=>{if(!added&&event.composedPath().some(node=>node.id==='edit-save')){added=true;document.querySelectorAll('section')[1].insertAdjacentHTML('beforeend',${JSON.stringify(repeated)});}},true);</script>`,
    });
  });
  try {
    const result = await runLiveSite(
      instance.context,
      instance.extensionId,
      site,
    );
    expect(result.outcome).toBe("passed");
  } finally {
    await instance.close();
  }
});
