import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startHide } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure first: old optional pictures on other sites consume the whole quota;
// dropping only the new picture cannot create space for even a previewless Hide.
for (const capture of [false, true]) {
  test(`Hide survives other profiles filling the real storage quota (${capture ? "capture" : "no capture"})`, async () => {
    const instance = await isolatedBrowser(undefined, { capture });
    const { context, extensionId, worker } = instance;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    try {
      const bridge = await driver(context, extensionId);
      const page = await context.newPage();
      await page.goto("http://127.0.0.1:5173/tests/fixture.html");
      const dock = await openDock(context, bridge, page);
      const pressure = await worker.evaluate(async () => {
        const key = "site:https://quota.example";
        const profile = {
          version: 1,
          origin: "https://quota.example",
          paused: true,
          rules: Array.from({ length: 31 }, (_, index) => ({
            id: `keep-${index}`,
            selector: `#keep-${index}`,
            label: "Saved",
            createdAt: index,
            preview: {
              dataUrl: "data:image/webp;base64,A",
              width: 1,
              height: 1,
              partial: false,
            },
          })),
        };
        await chrome.storage.local.set({ [key]: profile });
        const base = await chrome.storage.local.getBytesInUse(null);
        const each = Math.floor(
          (chrome.storage.local.QUOTA_BYTES - base - 24) / profile.rules.length,
        );
        for (const rule of profile.rules)
          rule.preview.dataUrl += "A".repeat(each);
        await chrome.storage.local.set({ [key]: profile });
        const room =
          chrome.storage.local.QUOTA_BYTES -
          (await chrome.storage.local.getBytesInUse(null));
        profile.rules[0].preview.dataUrl += "A".repeat(room);
        await chrome.storage.local.set({ [key]: profile });
        const bytes = await chrome.storage.local.getBytesInUse(null);
        let rejected = false;
        try {
          await chrome.storage.local.set({
            "quota-probe": { rules: [{ id: "probe-for-new-rule" }] },
          });
        } catch (error) {
          rejected = /quota/i.test(String(error));
        }
        return {
          rejected,
          bytes,
          quota: chrome.storage.local.QUOTA_BYTES,
          previewsValidSize: profile.rules.every(
            (rule) => rule.preview.dataUrl.length < 350000,
          ),
          sync: await chrome.storage.sync.get(null),
          session: await chrome.storage.session.get(null),
        };
      });
      expect(pressure.rejected).toBe(true);
      expect(pressure.previewsValidSize).toBe(true);
      expect(pressure.quota - pressure.bytes).toBeLessThan(64);
      await startHide(dock);
      await page.locator("#distraction").click();
      await expect(page.locator("#distraction")).toBeHidden();
      const stored = await worker.evaluate(async () => {
        const profiles = await chrome.storage.local.get([
          "site:http://127.0.0.1:5173",
          "site:https://quota.example",
        ]);
        const current = profiles["site:http://127.0.0.1:5173"];
        const other = profiles["site:https://quota.example"];
        return {
          current,
          other: {
            ...other,
            rules: other.rules.map(({ preview, ...rule }) => ({
              ...rule,
              hasPreview: !!preview,
            })),
          },
          sync: await chrome.storage.sync.get(null),
          session: await chrome.storage.session.get(null),
        };
      });
      expect(stored.current.rules).toHaveLength(1);
      expect(stored.current.rules[0].preview).toBeUndefined();
      expect(stored.other.paused).toBe(true);
      expect(stored.other.rules).toHaveLength(31);
      for (const [index, rule] of stored.other.rules.entries()) {
        expect(rule.id).toBe(`keep-${index}`);
        expect(rule.selector).toBe(`#keep-${index}`);
        expect(rule.hasPreview).toBe(false);
      }
      expect(stored.sync).toEqual(pressure.sync);
      expect(stored.session).toEqual(pressure.session);
    } finally {
      await context.tracing.stop({
        path: evidencePath(`preview-quota-${capture}.zip`),
      });
      await instance.close();
    }
  });
}

// Failure: evicting another site's preview before a second quota failure makes
// an unsuccessful edit mutate unrelated saved data. Exercise Chrome's real quota.
test("A failed quota recovery leaves unrelated previews intact", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId, worker } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const before = await worker.evaluate(async () => {
      const key = "site:https://preview.example";
      const profile = {
        version: 1,
        origin: "https://preview.example",
        rules: [
          {
            id: "retained",
            selector: "#retained",
            label: "Retained",
            createdAt: 1,
            preview: {
              dataUrl: "data:image/webp;base64," + "A".repeat(1000),
              width: 1,
              height: 1,
              partial: false,
            },
          },
        ],
      };
      await chrome.storage.local.set({ [key]: profile });
      await chrome.storage.local.set({ "quota-padding": "" });
      const room =
        chrome.storage.local.QUOTA_BYTES -
        (await chrome.storage.local.getBytesInUse(null));
      await chrome.storage.local.set({ "quota-padding": "X".repeat(room) });
      return {
        profile,
        bytes: await chrome.storage.local.getBytesInUse(null),
        quota: chrome.storage.local.QUOTA_BYTES,
      };
    });
    expect(before.quota - before.bytes).toBeLessThan(4);
    const result = await bridge.evaluate(async () =>
      chrome.runtime.sendMessage({
        type: "edit",
        origin: "https://edited.example",
        selector: "#edited",
        label: "Edited",
        styles: { opacity: "0.67" },
        text: "E".repeat(5000),
      }),
    );
    expect(result.error).toMatch(/quota/i);
    const after = await worker.evaluate(async () =>
      chrome.storage.local.get([
        "site:https://preview.example",
        "site:https://edited.example",
      ]),
    );
    expect(after["site:https://edited.example"]).toBeUndefined();
    expect(after["site:https://preview.example"]).toEqual(before.profile);
  } finally {
    await context.tracing.stop({
      path: evidencePath("preview-quota-atomic.zip"),
    });
    await instance.close();
  }
});
