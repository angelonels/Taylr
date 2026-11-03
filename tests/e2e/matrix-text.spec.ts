import { test, expect, documentWith } from "../matrix.mjs";

// Failure scenarios: a saved text edit does not render, alters neighbors, or
// any lifecycle step (Pause, reload, removal, replacement, site rewrite) fails
// to restore exactly the text the page owns at that moment.
const shapes: [string, string, string?][] = [
  ["paragraph", `<p id="t">Original words</p>`],
  ["padded whitespace", `<p id="t">  padded words  </p>`],
  ["entity", `<p id="t">Fish &amp; chips</p>`],
  ["emoji", `<p id="t">Party 🎉 time</p>`],
  ["right-to-left", `<p id="t" dir="rtl">مرحبا بالعالم</p>`],
  ["CJK", `<p id="t">日本語のテキスト</p>`],
  ["comment-split", `<p id="t">Before<!-- note -->After</p>`],
  [
    "script-split nodes",
    `<p id="t">FirstSecond</p>`,
    `document.querySelector("#t").firstChild.splitText(5)`,
  ],
  ["empty", `<p id="t"></p>`],
  ["button", `<button id="t">Press</button>`],
  ["link", `<a id="t" href="#anchor">Read more</a>`],
  ["list item", `<ul><li id="t">Item one</li><li>Item two</li></ul>`],
  [
    "table cell",
    `<table><tr><td id="t">Cell value</td><td>Other</td></tr></table>`,
  ],
  ["label", `<label id="t" for="field">Field label</label><input id="field">`],
  ["heading", `<h1 id="t">Main heading</h1>`],
  ["inline span", `<p>Lead <span id="t">inline</span> tail</p>`],
  ["preformatted", `<pre id="t">line one\nline two</pre>`],
];
const text = (tab: import("@playwright/test").Page) =>
  tab.evaluate(() => document.querySelector("#t")!.textContent);
const lifecycles = [
  "Restore",
  "Pause, Resume and Restore",
  "reload and Restore",
  "Remove",
  "a second edit and Restore",
  "a site rewrite and Restore",
] as const;
for (const [shape, body, script] of shapes)
  for (const name of lifecycles)
    test(`Text matrix: ${shape} survives ${name}`, async ({ site }) => {
      site.serve("/", documentWith(body));
      await site.register();
      const tab = await site.open();
      if (script) await tab.evaluate(script);
      const original = (await text(tab)) ?? "";
      const bystander = await tab.locator("#bystander").textContent();
      const edited = `${original.trim() || "Blank"} · Taylr`;
      await site.edit("#t", {}, edited);
      await expect.poll(() => text(tab)).toBe(edited);
      let expected = original;
      switch (name) {
        case "Pause, Resume and Restore":
          await site.ok({ type: "set-paused", paused: true });
          await expect.poll(() => text(tab)).toBe(original);
          await site.ok({ type: "set-paused", paused: false });
          await expect.poll(() => text(tab)).toBe(edited);
          break;
        case "reload and Restore":
          await tab.reload();
          await expect.poll(() => text(tab)).toBe(edited);
          break;
        case "a second edit and Restore":
          await site.edit("#t", {}, "Second edit");
          await expect.poll(() => text(tab)).toBe("Second edit");
          break;
        case "a site rewrite and Restore":
          await tab.evaluate(() => {
            document.querySelector("#t")!.textContent = "Site update";
          });
          await expect.poll(() => text(tab)).toBe(edited);
          expected = "Site update";
          break;
      }
      if (name === "Remove") {
        const [rule] = (await site.profile()).rules;
        await site.ok({ type: "remove", id: rule.id });
      } else await site.ok({ type: "restore" });
      await expect.poll(() => text(tab)).toBe(expected);
      await expect(tab.locator("#bystander")).toHaveText(bystander!);
    });

// Text rules on structures the editor never offers must not write text.
const ineligible: [string, string][] = [
  ["a parent of elements", `<p id="t">Hello <b>there</b></p>`],
  ["a textarea", `<textarea id="t">Draft</textarea>`],
  ["an option", `<select><option id="t">Choice</option></select>`],
  [
    "contenteditable content",
    `<div contenteditable><p id="t">Editable</p></div>`,
  ],
  [
    "SVG text",
    `<svg width="80" height="20"><text id="t" y="15">Vector</text></svg>`,
  ],
  ["a script", `<script id="t">window.marker = 1</script>`],
];
for (const [name, body] of ineligible)
  test(`Text matrix: ${name} keeps its content`, async ({ site }) => {
    site.serve("/", documentWith(body));
    await site.register();
    const tab = await site.open();
    const html = () =>
      tab.evaluate(() => document.querySelector("#t")!.innerHTML);
    const original = await html();
    await site.edit("#t", { color: "red" }, "Replaced");
    await expect(tab.locator("#t")).toHaveCSS("color", "rgb(255, 0, 0)");
    expect(await html()).toBe(original);
    await site.ok({ type: "restore" });
    expect(await html()).toBe(original);
  });
