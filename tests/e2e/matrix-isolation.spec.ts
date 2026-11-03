import { test, expect, documentWith } from "../matrix.mjs";

// Failure scenarios: one stored rule escapes its own CSS block. An unclosed
// comment, string or block in a selector or value would swallow later saved
// rules, or style the whole page. Each hostile rule is saved first, so every
// later rule depends on the stylesheet staying well formed.
const page = documentWith(
  `<p id="a">Edited</p><p id="b">Recolored</p><p id="hidden">Hidden</p>`,
);
const selectors = [
  "#a /*",
  "#a /* comment",
  '#a "',
  "#a '",
  "#a \\",
  "#a ;",
  "#a )",
  "#a ]",
  "#a:is(",
  '#a[title="x',
  "#a\n",
  "@media all",
  "x{} body",
  "#a } body {",
  "#a, body /*",
  "</style><p>",
];
const values: [string, string][] = [
  ["font-family", 'a"'],
  ["font-family", "a'"],
  ["font-family", '"a'],
  ["font-family", "'"],
  ["font-family", 'Georgia" b'],
  ["font-family", "\"'"],
];
async function expectIsolated(
  tab: import("@playwright/test").Page,
  attempt: Promise<unknown>,
) {
  await attempt;
  await expect(tab.locator("#hidden")).toBeHidden();
  await expect(tab.locator("#b")).toHaveCSS("color", "rgb(0, 128, 0)");
  await expect(tab.locator("#bystander")).toBeVisible();
  await expect(tab.locator("#bystander")).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(tab.locator("body")).toHaveCSS("display", "block");
}
async function later(site: {
  edit: (selector: string, styles: Record<string, string>) => Promise<unknown>;
  hide: (selector: string) => Promise<unknown>;
}) {
  await site.edit("#b", { color: "green" });
  await site.hide("#hidden");
}

for (const selector of selectors) {
  test(`CSS isolation: edit selector ${JSON.stringify(selector)} cannot break later rules`, async ({
    site,
  }) => {
    site.serve("/", page);
    await site.register();
    const tab = await site.open();
    await expectIsolated(
      tab,
      site
        .rpc({
          type: "edit",
          selector,
          label: "Hostile",
          styles: { color: "red" },
        })
        .then(() => later(site)),
    );
    await tab.reload();
    await expectIsolated(tab, Promise.resolve());
  });
  test(`CSS isolation: Hide selector ${JSON.stringify(selector)} cannot break later rules`, async ({
    site,
  }) => {
    site.serve("/", page);
    await site.register();
    const tab = await site.open();
    await expectIsolated(
      tab,
      site
        .rpc({ type: "add", selector, label: "Hostile" })
        .then(() => later(site)),
    );
    await tab.reload();
    await expectIsolated(tab, Promise.resolve());
  });
}
for (const [key, value] of values)
  test(`CSS isolation: ${key} value ${JSON.stringify(value)} cannot break later rules`, async ({
    site,
  }) => {
    site.serve("/", page);
    await site.register();
    const tab = await site.open();
    await expectIsolated(
      tab,
      site
        .rpc({
          type: "edit",
          selector: "#a",
          label: "Hostile",
          styles: { [key]: value },
        })
        .then(() => later(site)),
    );
    await tab.reload();
    await expectIsolated(tab, Promise.resolve());
  });
