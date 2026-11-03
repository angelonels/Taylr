import { test, expect, documentWith } from "../matrix.mjs";

// Failure scenarios: a saved value for any allowlisted property fails to
// render, renders differently from the browser's own value, leaks to a
// bystander, survives Restore, or is lost on reload.
const colors = [
  "#ff0000",
  "rebeccapurple",
  "rgb(0 128 0 / 50%)",
  "hsl(200 50% 40%)",
  "oklch(0.7 0.1 200)",
];
const lengths = ["12px", "1.5rem", "0"];
const cases: [string, string][] = [
  ...["color", "background-color", "border-color"].flatMap((key) =>
    colors.map((value): [string, string] => [key, value]),
  ),
  ...["0", "0.5", "1"].map((value): [string, string] => ["opacity", value]),
  ...["Georgia", "monospace", "'Courier New', serif"].map(
    (value): [string, string] => ["font-family", value],
  ),
  ...[
    "font-size",
    "border-radius",
    "border-width",
    "width",
    "height",
    "row-gap",
    "column-gap",
    ...["top", "right", "bottom", "left"].flatMap((side) => [
      `padding-${side}`,
      `margin-${side}`,
    ]),
  ].flatMap((key) => lengths.map((value): [string, string] => [key, value])),
  ...["top", "right", "bottom", "left"].map((side): [string, string] => [
    `margin-${side}`,
    "-8px",
  ]),
  ...["100", "200", "300", "400", "500", "600", "700", "800", "900"].map(
    (value): [string, string] => ["font-weight", value],
  ),
  ...["none", "solid", "dashed", "dotted", "double"].map(
    (value): [string, string] => ["border-style", value],
  ),
  ...[
    "block",
    "inline",
    "inline-block",
    "flex",
    "inline-flex",
    "grid",
    "inline-grid",
  ].map((value): [string, string] => ["display", value]),
  ...["row", "column", "row-reverse", "column-reverse"].map(
    (value): [string, string] => ["flex-direction", value],
  ),
  ...[
    "normal",
    "flex-start",
    "center",
    "flex-end",
    "space-between",
    "space-around",
    "space-evenly",
  ].map((value): [string, string] => ["justify-content", value]),
  ...["normal", "stretch", "flex-start", "center", "flex-end", "baseline"].map(
    (value): [string, string] => ["align-items", value],
  ),
  ...["auto", "16 / 9", "1.5", "4/3"].map((value): [string, string] => [
    "aspect-ratio",
    value,
  ]),
];
const base =
  "display:flex;border:2px solid #333;padding:4px;margin:4px;width:200px;height:60px;color:#111;background:#eee;font:16px sans-serif";
const page = documentWith(
  `<main style="width:600px"><section id="target" style="${base}">Target</section><section id="control" style="${base}">Control</section></main>`,
);
const read = (key: string) =>
  `[...document.querySelectorAll("#target,#control,#bystander")].map(e=>getComputedStyle(e).getPropertyValue(${JSON.stringify(key)}))`;

for (const [key, value] of cases)
  test(`Style matrix: ${key}: ${value} renders, persists and restores`, async ({
    site,
  }) => {
    site.serve("/", page);
    await site.register();
    const tab = await site.open();
    // The target starts from another listed value, so a rule that never
    // applies, or survives Restore, cannot match by coincidence. Its inline
    // declaration also proves saved edits outrank page inline styles.
    const alternate = cases.find(
      ([other, next]) => other === key && next !== value,
    )![1];
    const prepare = () =>
      tab.evaluate(
        ([key, value, alternate]) => {
          document
            .querySelector<HTMLElement>("#target")!
            .style.setProperty(key, alternate);
          document
            .querySelector<HTMLElement>("#control")!
            .style.setProperty(key, value);
        },
        [key, value, alternate],
      );
    await prepare();
    const [baseline, expected, bystander] = (await tab.evaluate(
      read(key),
    )) as string[];
    expect(expected).not.toBe(baseline);
    await site.edit("#target", { [key]: value });
    await expect
      .poll(() => tab.evaluate(read(key)))
      .toEqual([expected, expected, bystander]);
    await tab.reload();
    await prepare();
    await expect
      .poll(() => tab.evaluate(read(key)))
      .toEqual([expected, expected, bystander]);
    await site.ok({ type: "restore" });
    await expect
      .poll(async () => ((await tab.evaluate(read(key))) as string[])[0])
      .toBe(baseline);
  });
