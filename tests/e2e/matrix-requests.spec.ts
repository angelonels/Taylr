import { test, expect } from "../matrix.mjs";

// Failure scenarios: the single writer accepts a malformed or hostile request,
// persists it, or lets a rejected request damage the saved profile. Every
// rejection must leave storage exactly as it was.
const fields = [
  "color",
  "background-color",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "border-radius",
  "border-color",
  "border-width",
  "border-style",
  "width",
  "height",
  "aspect-ratio",
  ...["padding", "margin"].flatMap((type) =>
    ["top", "right", "bottom", "left"].map((side) => `${type}-${side}`),
  ),
  "display",
  "flex-direction",
  "justify-content",
  "align-items",
  "row-gap",
  "column-gap",
];
const injections = [
  "red; } body { display: none",
  "1px; position: fixed",
  "</style><script>alert(1)</script>",
  "x".repeat(257),
];
const rejectedEdits: [string, Record<string, unknown>][] = [
  ...fields.flatMap((key) =>
    injections.map((value): [string, Record<string, unknown>] => [
      `${key} rejects ${JSON.stringify(value.slice(0, 32))}`,
      { styles: { [key]: value } },
    ]),
  ),
  ...[
    "position",
    "content",
    "behavior",
    "-webkit-user-modify",
    "pointer-events",
  ].map((key): [string, Record<string, unknown>] => [
    `unknown property ${key}`,
    { styles: { [key]: "auto" } },
  ]),
  ...[null, [], "color:red", 5].map(
    (styles): [string, Record<string, unknown>] => [
      `styles ${JSON.stringify(styles)}`,
      { styles },
    ],
  ),
  ...[1, null, true].map((value): [string, Record<string, unknown>] => [
    `non-string value ${JSON.stringify(value)}`,
    { styles: { color: value } },
  ]),
  ["selector with {", { selector: "#a {" }],
  ["selector with }", { selector: "#a }" }],
  ["overlong selector", { selector: `#${"a".repeat(4096)}` }],
  ["numeric selector", { selector: 42 }],
  ["missing selector", { selector: undefined }],
  ["numeric label", { label: 7 }],
  ["numeric text", { text: 7 }],
  ["object text", { text: { value: "x" } }],
  ["overlong text", { text: "x".repeat(5001) }],
];
for (const [name, patch] of rejectedEdits)
  test(`Request matrix: edit ${name}`, async ({ site }) => {
    await site.edit("#seed", { color: "red" }, "Seed");
    const before = await site.stored();
    const result = await site.rpc({
      type: "edit",
      selector: "#a",
      label: "Matrix",
      styles: {},
      ...patch,
    });
    expect(result.error).toBeTruthy();
    expect(await site.stored()).toEqual(before);
  });

for (const key of ["__proto__", "constructor", "toString"])
  test(`Request matrix: edit refuses prototype key ${key}`, async ({
    site,
  }) => {
    await site.edit("#seed", { color: "red" }, "Seed");
    const before = await site.stored();
    const result = await site.rpcJson(
      `{"type":"edit","selector":"#a","label":"Matrix","styles":{"${key}":"auto"}}`,
    );
    expect(result.error).toBeTruthy();
    expect(await site.stored()).toEqual(before);
  });

const rejectedAdds: [string, Record<string, unknown>][] = [
  ["selector with {", { selector: "x{} body" }],
  ["selector with }", { selector: "#a } body {" }],
  ["overlong selector", { selector: `#${"a".repeat(4096)}` }],
  ["numeric selector", { selector: 42 }],
  ["object selector", { selector: { toString: "#a" } }],
  ["numeric label", { label: 7 }],
  ["missing label", { label: undefined }],
];
for (const [name, patch] of rejectedAdds)
  test(`Request matrix: Hide ${name}`, async ({ site }) => {
    await site.hide("#seed");
    const before = await site.stored();
    const result = await site.rpc({
      type: "add",
      selector: "#a",
      label: "Matrix",
      ...patch,
    });
    expect(result.error).toBeTruthy();
    expect(await site.stored()).toEqual(before);
  });

const origins = [
  "file:///etc/passwd",
  "chrome://settings",
  "javascript:alert(1)",
  "data:text/html,x",
  "ftp://files.taylr.test",
  "http://path.taylr.test/page",
  "http://path.taylr.test/",
  "https://port.taylr.test:443",
  "http://user@auth.taylr.test",
  "",
  "not a url",
];
for (const type of ["get", "add", "edit", "restore", "set-paused"])
  for (const origin of origins)
    test(`Request matrix: ${type} refuses origin ${JSON.stringify(origin)}`, async ({
      bridge,
    }) => {
      const keys = async () =>
        Object.keys(await bridge.evaluate(() => chrome.storage.local.get()));
      const before = await keys();
      const result = await bridge.evaluate(
        (message) => chrome.runtime.sendMessage(message),
        {
          type,
          origin,
          selector: "#a",
          label: "Matrix",
          styles: {},
          paused: true,
        },
      );
      expect(result.error).toBeTruthy();
      expect(await keys()).toEqual(before);
    });

for (const paused of ["true", 1, null, undefined])
  test(`Request matrix: Pause refuses ${JSON.stringify(paused)}`, async ({
    site,
  }) => {
    await site.hide("#seed");
    const before = await site.stored();
    const result = await site.rpc({ type: "set-paused", paused });
    expect(result.error).toBeTruthy();
    expect(await site.stored()).toEqual(before);
  });

for (const [name, kind] of [
  ["edit", "edit"],
  ["Hide", "add"],
])
  test(`Request matrix: a paused site refuses ${name}`, async ({ site }) => {
    await site.register();
    await site.ok({ type: "set-paused", paused: true });
    const before = await site.stored();
    const result = await site.rpc({
      type: kind,
      selector: "#a",
      label: "Matrix",
      styles: { color: "red" },
    });
    expect(result.error).toMatch(/Resume/);
    expect(await site.stored()).toEqual(before);
  });

test("Request matrix: repeated Hide stores one rule", async ({ site }) => {
  const first = await site.hide("#a");
  const second = await site.hide("#a");
  expect(first.createdRuleId).toBeTruthy();
  expect(second.createdRuleId).toBeUndefined();
  expect((await site.profile()).rules).toHaveLength(1);
});

test("Request matrix: Remove of an unknown rule keeps saved rules", async ({
  site,
}) => {
  await site.hide("#a");
  await site.ok({ type: "remove", id: "missing" });
  expect((await site.profile()).rules).toHaveLength(1);
});

test("Request matrix: edits merge properties and keep saved text", async ({
  site,
}) => {
  await site.edit("#a", { color: "red" }, "Words");
  const { savedRule } = await site.edit("#a", { opacity: "0.5" });
  expect(savedRule).toMatchObject({
    styles: { color: "red", opacity: "0.5" },
    text: "Words",
  });
  expect((await site.profile()).rules).toHaveLength(1);
});

test("Request matrix: text at the limit is accepted", async ({ site }) => {
  const { savedRule } = await site.edit("#a", {}, "x".repeat(5000));
  expect(savedRule.text).toHaveLength(5000);
});

const undoCases: [string, (rule: Record<string, unknown>) => unknown][] = [
  ["an unknown rule", (rule) => ({ id: "missing", revision: rule.revision })],
  ["a stale revision", (rule) => ({ id: rule.id, revision: "stale" })],
  [
    "history for another selector",
    (rule) => ({
      id: rule.id,
      revision: rule.revision,
      before: { ...rule, selector: "#other" },
    }),
  ],
  [
    "history with hostile styles",
    (rule) => ({
      id: rule.id,
      revision: rule.revision,
      before: { ...rule, styles: { color: "red;}body{display:none" } },
    }),
  ],
  [
    "history with overlong text",
    (rule) => ({
      id: rule.id,
      revision: rule.revision,
      before: { ...rule, text: "x".repeat(5001) },
    }),
  ],
  [
    "history that changes kind",
    (rule) => ({
      id: rule.id,
      revision: rule.revision,
      before: { ...rule, kind: undefined },
    }),
  ],
];
for (const [name, build] of undoCases)
  test(`Request matrix: Undo refuses ${name}`, async ({ site }) => {
    const { savedRule } = await site.edit("#a", { color: "red" });
    const before = await site.stored();
    const result = await site.rpc({ type: "undo-edit", ...build(savedRule) });
    expect(result.error).toBeTruthy();
    expect(await site.stored()).toEqual(before);
  });
