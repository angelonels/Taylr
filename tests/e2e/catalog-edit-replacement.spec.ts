import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

for (const stage of ["saved", "draft"] as const) {
  test(`Catalog editor handles one native root replacement during ${stage}`, async () => {
    const site = {
      id: `catalog-edit-replacement-${stage}`,
      caseId: "primary",
      component: "Replaced article",
      url: `http://127.0.0.1:5173/catalog-edit-replacement-${stage}`,
      target: "#selected",
      keep: "#kept",
    };
    const instance = await isolatedBrowser(site);
    const mutations: {
      stage: string;
      count: number;
      oldConnected: boolean;
      newConnected: boolean;
      unique: boolean;
      identity: boolean;
    }[] = [];
    const snapshots: {
      phase: string;
      rules: { id: string; styles: Record<string, string> }[];
    }[] = [];
    const readRules = async () => {
      const bridge = instance.context
        .pages()
        .find((page) =>
          page
            .url()
            .startsWith(
              `chrome-extension://${instance.extensionId}/test-driver.html`,
            ),
        );
      if (!bridge)
        throw new Error(
          "Fixture could not find the existing read-only profile bridge",
        );
      return bridge.evaluate(
        async (origin) =>
          (await chrome.runtime.sendMessage({ type: "get", origin })).profile
            .rules,
        new URL(site.url).origin,
      );
    };
    await instance.context.exposeBinding(
      "__recordEditReplacement",
      async (
        _source,
        witness: (typeof mutations)[number] & { phase: string },
      ) => {
        if (witness.phase === "mutation") {
          const { phase: _phase, ...mutation } = witness;
          mutations.push(mutation);
        }
        snapshots.push({ phase: witness.phase, rules: await readRules() });
      },
    );
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Native editor root replacement</title><style>body{padding:40px;font:18px system-ui}article{display:block;width:420px;padding:25px;margin:20px;background:#ddd}</style><main><section><article id="selected"><span>Selected card</span></article><article id="kept"><span>Independent card</span></article></section></main><script>
let fired=false;let saved=false;let hooked=false;let changed=false;
function replace(){if(fired)return;fired=true;const original=document.querySelector('#selected');const replacement=original.cloneNode(true);original.replaceWith(replacement);window.__recordEditReplacement({phase:"mutation",stage:${JSON.stringify(stage)},count:1,oldConnected:original.isConnected,newConnected:replacement.isConnected,unique:document.querySelectorAll('#selected').length===1,identity:document.querySelector('#selected')===replacement});}
function hook(){if(hooked)return;const root=document.querySelector('taylr-tools')?.shadowRoot;if(!root)return;hooked=true;
new MutationObserver(()=>{if(fired&&!changed&&root.querySelector('#status')?.textContent==='This element changed. Pick it again.'){changed=true;window.__recordEditReplacement({phase:'element-changed'});}if(root.querySelector('#status')?.textContent==='Changes saved.'){saved=true;${stage === "saved" ? "replace();" : ""}}}).observe(root,{subtree:true,childList:true,characterData:true});
${stage === "draft" ? "root.addEventListener('click',event=>{if(saved&&event.isTrusted&&event.composedPath().some(node=>node.id==='edit-border-style'))replace();},true);" : ""}
}
new MutationObserver(hook).observe(document.documentElement,{childList:true,subtree:true});hook();
</script>`,
      }),
    );
    try {
      let failure: unknown;
      const result = await runLiveSite(
        instance.context,
        instance.extensionId,
        site,
      ).catch((error) => {
        failure = error;
        return null;
      });
      await expect.poll(() => mutations.length).toBe(1);
      expect(mutations).toEqual([
        {
          stage,
          count: 1,
          oldConnected: false,
          newConnected: true,
          unique: true,
          identity: true,
        },
      ]);
      await expect.poll(() => snapshots.length).toBe(2);
      const atMutation = snapshots.find(
        (snapshot) => snapshot.phase === "mutation",
      )!;
      const atCancellation = snapshots.find(
        (snapshot) => snapshot.phase === "element-changed",
      )!;
      expect(atMutation.rules).toHaveLength(1);
      const base = atMutation.rules[0];
      expect(base.id).toEqual(expect.any(String));
      expect(base.styles).toEqual({ opacity: "0.67", "border-radius": "17px" });
      // Both snapshots precede runLiveSite's final cleanup, which intentionally
      // empties storage. Discarding a disconnected draft must preserve its base.
      expect(atCancellation.rules).toHaveLength(1);
      expect(atCancellation.rules[0].id).toBe(base.id);
      expect(atCancellation.rules[0].styles).toEqual(base.styles);
      await test.info().attach("native-edit-replacement", {
        body: JSON.stringify({
          mutations,
          snapshots,
          failure:
            failure instanceof Error
              ? failure.message
              : failure
                ? JSON.stringify(failure)
                : "",
        }),
        contentType: "application/json",
      });
      expect(
        failure,
        "The complete public-site editor contract must recover from the witnessed replacement",
      ).toBeUndefined();
      expect(result?.outcome).toBe("passed");
    } finally {
      await instance.close();
    }
  });
}
