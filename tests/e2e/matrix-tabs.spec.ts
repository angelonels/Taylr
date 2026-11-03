import { test, expect, documentWith } from "../matrix.mjs";

// Failure scenarios: one open tab of an origin misses a broadcast, keeps a
// stale rule after Pause, Remove, Undo or Restore, or a later tab loads an
// outdated profile. Every open tab must converge on the saved state.
const body = `<p id="t">Original words</p><p id="other">Other words</p>`;
const operations = [
  "style edit",
  "text edit",
  "Hide",
  "Pause and Resume",
  "Restore",
  "Remove",
  "Undo of a first edit",
  "Undo to an earlier edit",
  "a tab opened after saving",
  "a reload while paused",
] as const;
for (const count of [1, 2, 3])
  for (const operation of operations)
    test(`Tab matrix: ${operation} reaches ${count} open tab${count > 1 ? "s" : ""}`, async ({
      site,
    }) => {
      const paths = ["/a", "/b", "/c"].slice(0, count);
      for (const path of paths) site.serve(path, documentWith(body));
      await site.register();
      const tabs = [];
      for (const path of paths) tabs.push(await site.open(path));
      const every = async (
        check: (tab: (typeof tabs)[number]) => Promise<void>,
      ) => {
        for (const tab of tabs) await check(tab);
      };
      const color = (value: string) =>
        every((tab) => expect(tab.locator("#t")).toHaveCSS("color", value));
      const words = (value: string) =>
        every((tab) => expect(tab.locator("#t")).toHaveText(value));
      const red = "rgb(255, 0, 0)",
        green = "rgb(0, 128, 0)",
        black = "rgb(0, 0, 0)";
      switch (operation) {
        case "style edit":
          await site.edit("#t", { color: "red" });
          await color(red);
          break;
        case "text edit":
          await site.edit("#t", {}, "Edited words");
          await words("Edited words");
          break;
        case "Hide":
          await site.hide("#t");
          await every((tab) => expect(tab.locator("#t")).toBeHidden());
          break;
        case "Pause and Resume":
          await site.hide("#t");
          await site.edit("#other", { color: "red" }, "Edited");
          await site.ok({ type: "set-paused", paused: true });
          await every((tab) => expect(tab.locator("#t")).toBeVisible());
          await every((tab) =>
            expect(tab.locator("#other")).toHaveText("Other words"),
          );
          await site.ok({ type: "set-paused", paused: false });
          await every((tab) => expect(tab.locator("#t")).toBeHidden());
          await every((tab) =>
            expect(tab.locator("#other")).toHaveText("Edited"),
          );
          break;
        case "Restore":
          await site.hide("#other");
          await site.edit("#t", { color: "red" }, "Edited words");
          await words("Edited words");
          await site.ok({ type: "restore" });
          await words("Original words");
          await color(black);
          await every((tab) => expect(tab.locator("#other")).toBeVisible());
          break;
        case "Remove": {
          const { createdRuleId } = await site.hide("#t");
          await site.hide("#other");
          await site.ok({ type: "remove", id: createdRuleId });
          await every((tab) => expect(tab.locator("#t")).toBeVisible());
          await every((tab) => expect(tab.locator("#other")).toBeHidden());
          break;
        }
        case "Undo of a first edit": {
          const { savedRule } = await site.edit(
            "#t",
            { color: "red" },
            "Edited",
          );
          await words("Edited");
          await site.ok({
            type: "undo-edit",
            id: savedRule.id,
            revision: savedRule.revision,
          });
          await words("Original words");
          await color(black);
          break;
        }
        case "Undo to an earlier edit": {
          await site.edit("#t", { color: "green" }, "First");
          const { savedRule, previousRule } = await site.edit(
            "#t",
            { color: "red" },
            "Second",
          );
          await words("Second");
          await site.ok({
            type: "undo-edit",
            id: savedRule.id,
            revision: savedRule.revision,
            before: previousRule,
          });
          await words("First");
          await color(green);
          break;
        }
        case "a tab opened after saving": {
          await site.edit("#t", { color: "red" }, "Edited words");
          site.serve("/late", documentWith(body));
          const late = await site.open("/late");
          tabs.push(late);
          await words("Edited words");
          await site.ok({ type: "restore" });
          await words("Original words");
          break;
        }
        case "a reload while paused":
          await site.edit("#t", { color: "red" }, "Edited words");
          await site.ok({ type: "set-paused", paused: true });
          await tabs[0].reload();
          await words("Original words");
          await color(black);
          await site.ok({ type: "set-paused", paused: false });
          await words("Edited words");
          await color(red);
          break;
      }
    });
