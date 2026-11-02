import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { runLiveSite } from "../scenarios/live.mjs";

// Failure first: a passing public-site scenario must prove the complete editor
// groups, repeat Save/Undo, real text where eligible, and persisted styles.
for (const leaf of [false, true]) {
  test(`Public editor contract covers every property (${leaf ? "text" : "nested"})`, async () => {
    const site = {
      id: `full-editor-${leaf ? "leaf" : "nested"}`,
      caseId: "primary",
      component: "Editable control",
      url: "http://127.0.0.1:5173/full-editor",
      target: "#selected",
      keep: "#kept",
    };
    const instance = await isolatedBrowser(site);
    await instance.context.route(site.url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>Full editor</title><style>body{padding:80px;font:18px system-ui}button,article,aside{padding:30px;margin:20px;background:#eee}</style>${leaf ? '<button id="selected">Selected</button>' : '<article id="selected"><h2>Nested heading</h2><button>Nested action</button></article>'}<aside id="kept">Independent</aside>`,
      }),
    );
    await instance.worker.evaluate(() => {
      const write = chrome.storage.local.set.bind(chrome.storage.local);
      globalThis.__editorProfiles = [];
      chrome.storage.local.set = async (items) => {
        globalThis.__editorProfiles.push(structuredClone(items));
        return write(items);
      };
    });
    try {
      const result = await runLiveSite(
        instance.context,
        instance.extensionId,
        site,
      );
      expect(result.outcome).toBe("passed");
      const profiles = await instance.worker.evaluate(
        () => globalThis.__editorProfiles,
      );
      const rules = profiles.flatMap((record) =>
        Object.values(record).flatMap(
          (profile: {
            rules: { kind?: string; styles?: object; text?: string }[];
          }) => profile.rules,
        ),
      );
      expect(
        rules.some(
          (rule) =>
            rule.kind === "edit" &&
            Object.keys(rule.styles ?? {}).length === 21,
        ),
      ).toBe(true);
      if (leaf)
        expect(
          rules.some(
            (rule) => typeof rule.text === "string" && rule.text !== "Selected",
          ),
        ).toBe(true);
      expect(
        result.checks.some((check: string) =>
          check.includes("available properties"),
        ),
      ).toBe(true);
    } finally {
      await instance.close();
    }
  });
}
