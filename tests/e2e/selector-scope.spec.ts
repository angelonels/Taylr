import { test } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Failure first: an attribute-less custom card has a stable nested content link.
// After reload, each card becomes first-of-type in a different scope. Hiding the
// selected card must neither reveal it nor hide the unrelated first-in-scope card.
test("Selector identity: attribute-less cards survive changing sibling scopes", async () => {
  const instance = await isolatedBrowser();
  let visits = 0;
  try {
    await instance.context.route(
      "http://127.0.0.1:5173/selector-scopes",
      (route) => {
        const selected =
          '<feed-card><a href="/watch?v=chosen">Chosen video</a></feed-card>';
        const kept =
          '<feed-card><a href="/watch?v=neighbor">Neighbor video</a></feed-card>';
        const content =
          ++visits === 1
            ? `<section>${selected}${kept}</section>`
            : `<section>${kept}</section><section>${selected}</section>`;
        return route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><title>Changing card scopes</title><style>feed-card{display:block;width:480px;height:120px;margin:24px;background:#dde6f9}a{display:block;padding:24px}</style><main>${content}</main>`,
        });
      },
    );
    await runLiveSite(instance.context, instance.extensionId, {
      id: "selector-scopes",
      caseId: "primary",
      component: "Attribute-less custom card",
      url: "http://127.0.0.1:5173/selector-scopes",
      target: "feed-card",
      targetIndex: 0,
      keep: "feed-card",
      keepIndex: 1,
      identity: { selector: "a[href]", attribute: "href" },
    });
  } finally {
    await instance.close();
  }
});

// Failure first: impression/session values change on reload, but product IDs
// remain distinct even when two variants share the same product path.
test("Selector identity: product links survive changing attribution without merging variants", async () => {
  const site = {
    id: "product-attribution",
    caseId: "primary",
    component: "Product link",
    url: "https://www.flipkart.com/search?q=notebook",
    target: 'a[title="Chosen product"]',
    keep: 'a[title="Neighbor product"]',
  };
  const instance = await isolatedBrowser(site);
  let visits = 0;
  try {
    await instance.context.route(site.url, (route) => {
      const visit = ++visits;
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Product attribution</title><style>a{display:block;width:480px;height:120px;margin:24px;background:#dde6f9}</style><main><a title="Chosen product" href="/notebook/p/itm123?pid=CHOSEN&iid=impression-${visit}&ssid=session-${visit}">Chosen product</a><a title="Neighbor product" href="/notebook/p/itm123?pid=NEIGHBOR&iid=impression-${visit}&ssid=session-${visit}">Neighbor product</a></main>`,
      });
    });
    await runLiveSite(instance.context, instance.extensionId, site);
  } finally {
    await instance.close();
  }
});

// Failure first: duplicate generic test IDs and regenerated dropdown IDs must
// still select the unique listbox trigger through its stable accessibility role.
test("Selector identity: dropdown semantics survive generated numeric IDs", async () => {
  const instance = await isolatedBrowser();
  let visits = 0;
  try {
    await instance.context.route("http://127.0.0.1:5173/dropdowns", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Generated dropdown IDs</title><style>button{display:block;width:300px;height:80px;margin:24px}</style><main><button id="dropdown-toggle-btn-${++visits}" data-testid="base-dropdown-toggle" aria-haspopup="listbox">Branch</button><button data-testid="base-dropdown-toggle" aria-haspopup="menu">Actions</button></main>`,
      }),
    );
    await runLiveSite(instance.context, instance.extensionId, {
      id: "dropdown-identity",
      caseId: "primary",
      component: "Branch dropdown",
      url: "http://127.0.0.1:5173/dropdowns",
      target: 'button[aria-haspopup="listbox"]',
      keep: 'button[aria-haspopup="menu"]',
    });
  } finally {
    await instance.close();
  }
});

// Attribution-looking keys can identify different content on another origin.
// Reorder otherwise identical links so an over-broad query filter hides a peer.
test("Selector identity: query identity is preserved on unrelated origins", async () => {
  const instance = await isolatedBrowser();
  let visits = 0;
  try {
    await instance.context.route(
      "http://127.0.0.1:5173/query-identity",
      (route) => {
        const chosen =
          '<a title="Chosen" href="/notebook/p/itm123?pid=SAME&iid=chosen">Chosen</a>';
        const neighbor =
          '<a title="Neighbor" href="/notebook/p/itm123?pid=SAME&iid=neighbor">Neighbor</a>';
        return route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><title>Query identity</title><style>a{display:block;width:400px;height:100px;margin:24px;background:#dde6f9}</style><main>${++visits === 1 ? chosen + neighbor : neighbor + chosen}</main>`,
        });
      },
    );
    await runLiveSite(instance.context, instance.extensionId, {
      id: "query-identity",
      caseId: "primary",
      component: "Content query link",
      url: "http://127.0.0.1:5173/query-identity",
      target: 'a[title="Chosen"]',
      keep: 'a[title="Neighbor"]',
    });
  } finally {
    await instance.close();
  }
});

// Failure first: real Flipkart evidence changed ppt/ppn from sp to None while
// product path, pid and lid remained identical. Retain each identity discriminator.
for (const distinct of ["pid", "lid"]) {
  test(`Selector identity: Flipkart page attribution preserves distinct ${distinct}`, async () => {
    const site = {
      id: `product-page-attribution-${distinct}`,
      caseId: "primary",
      component: "Product variant link",
      url: "https://www.flipkart.com/search?q=notebook",
      target: 'a[title="Chosen product"]',
      keep: 'a[title="Neighbor product"]',
    };
    const instance = await isolatedBrowser(site);
    let visits = 0;
    try {
      await instance.context.route(site.url, (route) => {
        const visit = ++visits;
        const attribution = visit === 1 ? "sp" : "None";
        const link = (chosen: boolean) => {
          const pid = chosen || distinct === "lid" ? "CHOSEN" : "NEIGHBOR";
          const lid = chosen || distinct === "pid" ? "LISTING_A" : "LISTING_B";
          const title = chosen ? "Chosen product" : "Neighbor product";
          return `<a title="${title}" href="/notebook/p/itm123?pid=${pid}&lid=${lid}&ppt=${attribution}&ppn=${attribution}&view=full">${title}</a>`;
        };
        return route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><title>Product page attribution</title><style>a{display:block;width:480px;height:120px;margin:24px;background:#dde6f9}</style><main>${visit === 1 ? link(true) + link(false) : link(false) + link(true)}</main>`,
        });
      });
      await runLiveSite(instance.context, instance.extensionId, site);
    } finally {
      await instance.close();
    }
  });
}

// Negative control: the same query keys can be content identity elsewhere.
test("Selector identity: page attribution keys remain identity outside Flipkart", async () => {
  const instance = await isolatedBrowser();
  let visits = 0;
  try {
    await instance.context.route(
      "http://127.0.0.1:5173/page-attribution-identity",
      (route) => {
        const chosen =
          '<a title="Chosen" href="/notebook/p/itm123?pid=SAME&lid=SAME&ppt=chosen&ppn=chosen">Chosen</a>';
        const neighbor =
          '<a title="Neighbor" href="/notebook/p/itm123?pid=SAME&lid=SAME&ppt=neighbor&ppn=neighbor">Neighbor</a>';
        return route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><title>Literal query identity</title><style>a{display:block;width:480px;height:120px;margin:24px;background:#dde6f9}</style><main>${++visits === 1 ? chosen + neighbor : neighbor + chosen}</main>`,
        });
      },
    );
    await runLiveSite(instance.context, instance.extensionId, {
      id: "page-attribution-identity",
      caseId: "primary",
      component: "Query-identified content",
      url: "http://127.0.0.1:5173/page-attribution-identity",
      target: 'a[title="Chosen"]',
      keep: 'a[title="Neighbor"]',
    });
  } finally {
    await instance.close();
  }
});
