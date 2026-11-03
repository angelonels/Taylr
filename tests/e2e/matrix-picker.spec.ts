import { test, expect, documentWith } from "../matrix.mjs";

// Failure scenarios: the picker stores a selector that matches a neighbor,
// relies on a per-render value, or stops matching after an unrelated banner
// or regenerated attribute appears on the next visit.
type Shape = {
  name: string;
  html: (generation: number) => string;
  target: string;
  others: string[];
};
const card = (title: string, extra = "") =>
  `<article${extra} style="padding:20px;margin:8px;border:1px solid #999">${title}</article>`;
const shapes: Shape[] = [
  {
    name: "a test identifier among identical cards",
    html: () =>
      `${card("First", ' data-testid="first"')}${card("Second", ' data-testid="second"')}`,
    target: '[data-testid="second"]',
    others: ['[data-testid="first"]'],
  },
  {
    name: "an accessible name among buttons",
    html: () =>
      `<button aria-label="Save draft">S</button><button aria-label="Share draft">H</button>`,
    target: '[aria-label="Share draft"]',
    others: ['[aria-label="Save draft"]'],
  },
  {
    name: "a stable identifier",
    html: () => `${card("Lead", ' id="lead"')}${card("Other")}`,
    target: "#lead",
    others: ["article:not(#lead)"],
  },
  {
    name: "a regenerated UUID identifier",
    html: (generation) =>
      `${card("Volatile", ` id="${generation ? "6f1d2c3b-aaaa-4bbb-8ccc-1234567890ab" : "0b9a8c7d-1111-4222-8333-abcdefabcdef"}"`)}${card("Neighbor")}`,
    target: "article:first-of-type",
    others: ["article:last-of-type"],
  },
  {
    name: "a regenerated framework identifier",
    html: (generation) =>
      `${card("Volatile", ` id=":r${generation}:"`)}${card("Neighbor")}`,
    target: "article:first-of-type",
    others: ["article:last-of-type"],
  },
  {
    name: "the third of repeated list items",
    html: () =>
      `<ul>${["One", "Two", "Three", "Four"].map((item) => `<li style="padding:6px">${item}</li>`).join("")}</ul>`,
    target: "li:nth-of-type(3)",
    others: ["li:nth-of-type(2)", "li:nth-of-type(4)"],
  },
  {
    name: "an image by alternative text",
    html: () =>
      ["Harbor", "Forest"]
        .map(
          (alt) =>
            `<img alt="${alt}" width="80" height="40" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='40'/%3E" style="background:#69c;margin:6px">`,
        )
        .join(""),
    target: 'img[alt="Forest"]',
    others: ['img[alt="Harbor"]'],
  },
  {
    name: "a link with changing attribution",
    html: (generation) =>
      `<nav><a href="/docs?page=2&utm_source=n${generation}" style="display:block;padding:8px">Docs</a><a href="/blog" style="display:block;padding:8px">Blog</a></nav>`,
    target: "a[href^='/docs']",
    others: ["a[href='/blog']"],
  },
  {
    name: "a named form field",
    html: () =>
      `<form><input name="email" placeholder="Email"><input name="phone" placeholder="Phone"></form>`,
    target: 'input[name="phone"]',
    others: ['input[name="email"]'],
  },
  {
    name: "a labelled tab",
    html: () =>
      `<div role="tablist"><button role="tab" aria-label="Overview">O</button><button role="tab" aria-label="Pricing">P</button></div>`,
    target: '[aria-label="Pricing"]',
    others: ['[aria-label="Overview"]'],
  },
  {
    name: "a deep attribute-less element",
    html: () =>
      `<div><div><div><span style="display:inline-block;padding:8px">Deep</span></div></div><div><div><span style="display:inline-block;padding:8px">Twin</span></div></div></div>`,
    target: "main >> text=Deep",
    others: ["main >> text=Twin"],
  },
  {
    name: "a card owned by its content link",
    html: () =>
      ["alpha", "beta"]
        .map((story) =>
          card(
            `<a href="/story/${story}">Story ${story}</a><p>Summary of ${story}</p>`,
          ),
        )
        .join(""),
    target: "article:has(a[href='/story/beta']) p",
    others: ["article:has(a[href='/story/alpha'])"],
  },
  {
    name: "an icon inside a button",
    html: () =>
      `<button aria-label="Close panel" style="padding:8px"><svg width="20" height="20"><rect width="20" height="20"/></svg></button><button aria-label="Open panel">Open</button>`,
    target: '[aria-label="Close panel"] svg',
    others: ['[aria-label="Open panel"]'],
  },
  {
    name: "a data test id variant",
    html: () =>
      `${card("Promo", ' data-test-id="promo"')}${card("Feed", ' data-test-id="feed"')}`,
    target: '[data-test-id="promo"]',
    others: ['[data-test-id="feed"]'],
  },
  {
    name: "a table cell in a repeated row",
    html: () =>
      `<table border="1"><tr><td>A1</td><td>A2</td></tr><tr><td>B1</td><td>B2</td></tr></table>`,
    target: "main >> text=B2",
    others: ["main >> text=A2", "main >> text=B1"],
  },
];
const variants = [
  "after reload",
  "after a banner is inserted",
  "after volatile values regenerate",
] as const;
for (const shape of shapes)
  for (const variant of variants)
    test(`Picker matrix: ${shape.name} stays the only hidden element ${variant}`, async ({
      site,
    }) => {
      const page = (generation: number, banner: boolean) =>
        documentWith(
          `${banner ? '<div class="banner"><p>Cookie notice</p></div>' : ""}<main>${shape.html(generation)}</main>`,
        );
      site.serve("/", page(0, false));
      await site.register();
      const tab = await site.open();
      const dock = await site.dock(tab);
      await site.startHide(dock);
      const target = tab.locator(shape.target);
      await target.click();
      await expect(target).toBeHidden();
      // The picker may promote an inner hit to its control; the hidden
      // element is then the control around the requested target.
      for (const other of shape.others)
        await expect(tab.locator(other)).toBeVisible();
      site.serve(
        "/",
        page(
          variant === "after volatile values regenerate" ? 1 : 0,
          variant === "after a banner is inserted",
        ),
      );
      await tab.reload();
      await expect(target).toBeHidden();
      for (const other of shape.others)
        await expect(tab.locator(other)).toBeVisible();
      await expect(tab.locator("#bystander")).toBeVisible();
    });
