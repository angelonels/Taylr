import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Failure first: focusing the panel changes the app's own word opacity. Reset
// must reveal that current native state, and an independent changing node is
// still retained without any Taylr declaration targeting it.
for (const words of [false, true]) {
  test(`Full editor honors native focus styles on ${words ? "selected" : "retained"} content`, async () => {
    const site = {
      id: `native-focus-${words}`,
      caseId: "primary",
      component: words ? "Word stream" : "Configuration button",
      url: "http://127.0.0.1:5173/native-focus",
      target: words ? "#words" : "#configuration",
      keep: words ? "#configuration" : "#words",
    };
    const instance = await isolatedBrowser(site);
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Focus-sensitive app</title><style>body{padding:50px}button,#words{display:block;width:400px;padding:30px;margin:40px}#words{opacity:1;transition:opacity .25s}#words.blurred{opacity:.25}</style><button id="configuration">Configure</button><div id="words"><span>One</span> <span>Two</span> <span>Three</span></div><script>window.addEventListener('pointerdown',event=>{if(event.target?.localName==='taylr-tools')document.querySelector('#words').classList.add('blurred');},true);</script>`,
      }),
    );
    try {
      expect(
        (await runLiveSite(instance.context, instance.extensionId, site))
          .outcome,
      ).toBe("passed");
      const pages = instance.context
        .pages()
        .filter((page) => page.url() === site.url);
      expect(pages).toHaveLength(2);
      let focused = 0;
      for (const page of pages) {
        const stream = page.locator("#words");
        const blurred = await stream.evaluate((element) =>
          element.classList.contains("blurred"),
        );
        if (blurred) focused++;
        await expect(stream).toHaveCSS("opacity", blurred ? "0.25" : "1");
        await expect(stream).not.toHaveAttribute("style");
        await expect(page.locator("#configuration")).not.toHaveAttribute(
          "style",
        );
      }
      expect(focused).toBeGreaterThan(0);
    } finally {
      await instance.close();
    }
  });
}

test("Full editor rejects an injected selector reaching retained content", async () => {
  const site = {
    id: "native-focus-leak",
    caseId: "primary",
    component: "Selected article",
    url: "http://127.0.0.1:5173/native-focus-leak",
    target: "#selected",
    keep: "#kept",
  };
  const instance = await isolatedBrowser(site);
  const leaks: { selector: string; opacity: string; present: boolean }[] = [];
  await instance.context.exposeBinding(
    "__recordRetainedLeak",
    (_source, witness: (typeof leaks)[number]) => leaks.push(witness),
  );
  await instance.context.route(site.url, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><title>Retained ownership negative control</title><style>body{padding:50px}article,aside{width:400px;padding:30px;margin:40px}</style><article id="selected">Selected article</article><aside id="kept">Independent content</aside><script>new MutationObserver(()=>{for(const style of document.querySelectorAll('style[data-taylr="rules"]')){if(style.sheet?.cssRules.length&&!Array.from(style.sheet.cssRules).some(rule=>rule.selectorText==='#kept')){const index=style.sheet.insertRule('#kept{opacity:.67!important}',style.sheet.cssRules.length);const rule=style.sheet.cssRules[index];window.__recordRetainedLeak({selector:rule.selectorText,opacity:rule.style.getPropertyValue('opacity'),present:Array.from(style.sheet.cssRules).includes(rule)});}}}).observe(document.documentElement,{subtree:true,childList:true,characterData:true});</script>`,
    }),
  );
  try {
    const error = await runLiveSite(
      instance.context,
      instance.extensionId,
      site,
    ).then(
      () => null,
      (cause: unknown) => cause,
    );
    await expect.poll(() => leaks.length).toBeGreaterThan(0);
    expect(leaks).toContainEqual({
      selector: "#kept",
      opacity: "0.67",
      present: true,
    });
    await test.info().attach("retained-selector-leak", {
      body: JSON.stringify(leaks),
      contentType: "application/json",
    });
    expect(error).toMatchObject({ phase: "edit", outcome: "product-failed" });
    expect(String(error)).toContain("#kept");
  } finally {
    await instance.close();
  }
});
