import { expect, test } from "@playwright/test";
import { access } from "node:fs/promises";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";
import { driver, invokeAction } from "../dock-actions.mjs";

// Failure scenarios, written before the harness changes:
// - A main-document 429/503 or visible challenge must be blocked before locator waits.
// - A transport failure must remain an environment failure, never an access block/pass.
// - Missing-locator actions need the explicit timeout on manually launched contexts.
// - Closing a disposable context must remove its data even after a test failure.
test.setTimeout(20000);
const bounded = (promise) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Harness did not classify promptly")),
        6000,
      ),
    ),
  ]);

for (const status of [429, 503]) {
  test(`Harness: HTTP ${status} is observed as an access block`, async () => {
    const site = {
      id: `harness-${status}`,
      caseId: "blocked",
      component: "missing component",
      url: "http://127.0.0.1:5173/harness-access",
      target: "#missing",
      keep: "#retained",
    };
    const instance = await isolatedBrowser(site);
    try {
      await instance.context.route(site.url, (route) =>
        route.fulfill({
          status,
          contentType: "text/html",
          body: "<!doctype html><title>Unavailable</title><p>Try later</p>",
        }),
      );
      const started = Date.now();
      await expect(
        bounded(runLiveSite(instance.context, instance.extensionId, site)),
      ).rejects.toMatchObject({
        outcome: "blocked",
        phase: "navigation",
        access: { status },
      });
      expect(Date.now() - started).toBeLessThan(10000);
    } finally {
      await instance.close();
    }
  });
}

test("Harness: transport errors stay environment failures and cleanup removes temporary data", async () => {
  const site = {
    id: "harness-network",
    caseId: "network",
    component: "missing",
    url: "http://127.0.0.1:5173/harness-network",
    target: "#missing",
    keep: "#kept",
  };
  const instance = await isolatedBrowser(site);
  try {
    await instance.context.route(site.url, (route) =>
      route.abort("connectionfailed"),
    );
    await expect(
      bounded(runLiveSite(instance.context, instance.extensionId, site)),
    ).rejects.toMatchObject({
      outcome: "environment-error",
      phase: "navigation",
    });
  } finally {
    await instance.close();
  }
  await expect(access(instance.root)).rejects.toThrow();
});

test("Harness: manual contexts enforce bounded locator actions", async () => {
  const instance = await isolatedBrowser(undefined, { actionTimeout: 150 });
  try {
    const page = await instance.context.newPage();
    await page.setContent("<button>Existing</button>");
    const started = Date.now();
    await expect(
      Promise.race([
        page.locator("#missing").click(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Harness timeout was not applied")),
            1500,
          ),
        ),
      ]),
    ).rejects.toThrow(/Timeout 150ms exceeded/);
    expect(Date.now() - started).toBeLessThan(1000);
  } finally {
    await instance.close();
  }
});

// Failure first: a healthy vendor application title is not positive evidence of a challenge.
test("Harness: healthy Cloudflare Dashboard title can complete Hide", async () => {
  const site = {
    id: "harness-healthy-vendor",
    caseId: "primary",
    component: "Healthy dashboard card",
    url: "http://127.0.0.1:5173/harness-healthy-vendor",
    target: "#target",
    keep: "#kept",
  };
  const instance = await isolatedBrowser(site);
  try {
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><title>Cloudflare Dashboard</title><style>aside,article{display:block;width:480px;height:120px;margin:24px;background:#dde6f9}</style><main><aside id="target">Dashboard card</aside><article id="kept">Keep this card</article></main>',
      }),
    );
    await expect(
      runLiveSite(instance.context, instance.extensionId, site),
    ).resolves.toMatchObject({ outcome: "passed" });
  } finally {
    await instance.close();
  }
});

// Failure first: optional evidence capture must not depend on third-party font completion.
test("Harness: an unresolved font cannot prevent Hide verification", async () => {
  const site = {
    id: "harness-pending-font",
    caseId: "primary",
    component: "Card with a pending font",
    url: "http://127.0.0.1:5173/harness-pending-font",
    target: "#target",
    keep: "#kept",
  };
  const instance = await isolatedBrowser(site);
  let requested = false;
  try {
    await instance.context.route("**/never-ready.woff2", async () => {
      requested = true;
      await new Promise(() => {});
    });
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><style>@font-face{font-family:pending;src:url('/never-ready.woff2')}body{font-family:pending,serif}aside,article{display:block;width:480px;height:120px;margin:24px;background:#dde6f9}</style><aside id="target">Hide this card</aside><article id="kept">Retain this card</article>`,
      }),
    );
    const result = await runLiveSite(
      instance.context,
      instance.extensionId,
      site,
    );
    expect(requested).toBe(true);
    expect(result.checks).toHaveLength(6);
  } finally {
    await instance.close();
  }
});

// Failure first: visible shells can precede state hydration on each reload or new tab.
test("Harness: exact application invariants await revisit hydration", async () => {
  const site = {
    id: "harness-revisit-hydration",
    caseId: "primary",
    component: "Ready shell with delayed application state",
    url: "http://127.0.0.1:5173/harness-revisit-hydration",
    target: "#target",
    keep: "#kept",
    invariant: { selector: "#state", expected: "Sprite1" },
  };
  const instance = await isolatedBrowser(site);
  let visits = 0;
  try {
    await instance.context.route(site.url, (route) => {
      visits++;
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><style>aside,article{display:block;width:480px;height:120px;margin:24px;background:#dde6f9}</style><aside id="target">Hide this card</aside><article id="kept">Retain this card</article><output id="state"></output><script>setTimeout(()=>document.querySelector('#state').textContent='Sprite1',1800)</script>`,
      });
    });
    const result = await runLiveSite(
      instance.context,
      instance.extensionId,
      site,
    );
    expect(visits).toBe(4);
    expect(result.checks).toHaveLength(6);
  } finally {
    await instance.close();
  }
});

// Failure first: application history can change between reading page.url() and
// querying Chrome tabs. The intended tab must remain stable across that change/reload.
// Playwright requires destructuring; this scenario owns its disposable browser.
// oxlint-disable-next-line no-empty-pattern
test("Harness: action tab identity survives canonical URL races and reload", async ({}, testInfo) => {
  const instance = await isolatedBrowser({
    url: "http://127.0.0.1:5173/tests/fixture.html",
    origins: ["http://localhost:5173"],
  });
  const { context, extensionId } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    const tabId = await bridge.evaluate(
      async (url) =>
        (await chrome.tabs.query({})).find((tab) => tab.url === url).id,
      page.url(),
    );
    await bridge.evaluate((tabId) => {
      const root = globalThis as typeof globalThis & {
        identityQueries: number;
      };
      root.identityQueries = 0;
      const query = chrome.tabs.query.bind(chrome.tabs);
      chrome.tabs.query = async (...args) => {
        root.identityQueries++;
        if (root.identityQueries === 1)
          await chrome.scripting.executeScript({
            target: { tabId },
            func: () =>
              history.replaceState(
                null,
                "",
                `${location.pathname}?canonical=1`,
              ),
          });
        return query(...args);
      };
    }, tabId);
    await invokeAction(context, bridge, page);
    await expect(page.getByRole("toolbar", { name: "Taylr" })).toBeVisible();
    expect(page.url()).toContain("canonical=1");
    await page.evaluate(() =>
      history.replaceState(null, "", `${location.pathname}?canonical=2`),
    );
    await invokeAction(context, bridge, page);
    await expect(page.getByRole("toolbar", { name: "Taylr" })).toHaveCount(0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await invokeAction(context, bridge, page);
    await expect(page.getByRole("toolbar", { name: "Taylr" })).toBeVisible();
    await expect(page.locator("taylr-tools")).toHaveCount(1);
    expect(page.url()).toContain("canonical=2");
    await context.route("http://localhost:5173/identity-other", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><title>Other origin</title><p>Independent page</p>",
      }),
    );
    const other = await context.newPage();
    await other.goto("http://localhost:5173/identity-other");
    await invokeAction(context, bridge, other);
    await expect(other.getByRole("toolbar", { name: "Taylr" })).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Taylr" })).toBeVisible();
    await invokeAction(context, bridge, other);
    await expect(other.getByRole("toolbar", { name: "Taylr" })).toHaveCount(0);
    await expect(page.getByRole("toolbar", { name: "Taylr" })).toBeVisible();
    const observed = await bridge.evaluate(
      async (tabId) => ({
        queries: (globalThis as typeof globalThis & { identityQueries: number })
          .identityQueries,
        tabId: (await chrome.tabs.get(tabId)).id,
      }),
      tabId,
    );
    expect(observed).toEqual({ queries: 2, tabId });
    await testInfo.attach("stable-tab-identity", {
      body: JSON.stringify({ ...observed, url: page.url() }),
      contentType: "application/json",
    });
  } finally {
    try {
      await context.tracing.stop({ path: testInfo.outputPath("trace.zip") });
    } finally {
      await instance.close();
    }
  }
});

// Failure first: the site can reflow after hit testing but before a native
// pointer move. Resampling must retain the same declared component and checks.
test("Harness: selection recovers when the target moves after point sampling", async () => {
  const site = {
    id: "harness-moving-target",
    caseId: "reflow",
    component: "moving component",
    url: "http://127.0.0.1:5173/harness-moving-target",
    target: "#moving",
    keep: "#retained",
  };
  const instance = await isolatedBrowser(site);
  let shifted = false;
  const createPage = instance.context.newPage.bind(instance.context);
  instance.context.newPage = async (...args) => {
    const page = await createPage(...args);
    const move = page.mouse.move.bind(page.mouse);
    page.mouse.move = async (...moveArgs) => {
      if (!shifted && page.url() === site.url) {
        await page.locator(site.target).evaluate((element) => {
          (element as HTMLElement).style.top = "380px";
        });
        shifted = true;
      }
      return move(...moveArgs);
    };
    return page;
  };
  try {
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Reflow fixture</title>
          <style>#moving{position:absolute;left:100px;top:200px;width:220px;height:60px;background:plum}#retained{position:absolute;left:500px;top:200px}</style>
          <section id="moving">Move this component</section><p id="retained">Independent retained content</p>`,
      }),
    );
    const result = await runLiveSite(
      instance.context,
      instance.extensionId,
      site,
    );
    expect(shifted).toBe(true);
    expect(result.checks).toHaveLength(6);
  } finally {
    await instance.close();
  }
});

// Failure first: hydration may replace the declared component while the user
// refines its nested hit. Only a disconnected node permits reacquisition.
test("Harness: selection reacquires a replaced declared component", async () => {
  const site = {
    id: "harness-replaced-target",
    caseId: "replacement",
    component: "hydrated component",
    url: "http://127.0.0.1:5173/harness-replaced-target",
    target: "#hydrated",
    keep: "#retained",
  };
  const instance = await isolatedBrowser(site);
  try {
    await instance.context.addInitScript(() => {
      window.addEventListener(
        "keydown",
        (event) => {
          if (event.key !== "ArrowUp" || sessionStorage.getItem("replacements"))
            return;
          const target = document.querySelector("#hydrated");
          if (!target) return;
          target.replaceWith(target.cloneNode(true));
          sessionStorage.setItem("replacements", "1");
        },
        { capture: true },
      );
    });
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Hydration fixture</title>
        <style>#hydrated{position:absolute;left:100px;top:200px;width:220px;height:70px;background:plum}#hydrated>div{width:100%;height:100%}#retained{position:absolute;left:500px;top:200px}</style>
        <section id="hydrated"><div><span>Nested content</span></div></section><p id="retained">Independent retained content</p>`,
      }),
    );
    const result = await runLiveSite(
      instance.context,
      instance.extensionId,
      site,
    );
    expect(result.checks).toHaveLength(6);
    const pages = instance.context
      .pages()
      .filter((page) => page.url() === site.url);
    expect(pages.length).toBeGreaterThan(0);
    expect(
      await pages[0].evaluate(() => sessionStorage.getItem("replacements")),
    ).toBe("1");
  } finally {
    await instance.close();
  }
});
