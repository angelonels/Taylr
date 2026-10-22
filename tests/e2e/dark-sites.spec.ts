import { test, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 15000 });
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { observeThemeResources } from "../theme-resources";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";
import {
  classifyFailure,
  inspectAccess,
  evidencePath,
  VerificationError,
} from "../run-evidence.mjs";

type Sample = {
  connected: boolean;
  visible: boolean;
  signature: string;
  text: string;
  color: string;
  background: string;
  contrast: number | null;
  width: number;
};
declare global {
  interface Window {
    __darkVerification: {
      samples: Element[];
      media: Element[];
      measure(this: void, el: Element): Sample;
      before: Sample[];
      mediaBefore: string[];
    };
  }
}
const sites = JSON.parse(await readFile("tests/sites.json", "utf8"));
const filters = process.env.TAYLR_SITES?.split(",").filter(Boolean);
const enabled = process.env.TAYLR_DARK_SITES === "1";
const fingerprint = createHash("sha256");
for (const path of [
  "dist/manifest.json",
  "tests/isolated-browser.mjs",
  "tests/dock-actions.mjs",
  "tests/run-evidence.mjs",
  "tests/theme-resources.ts",
  "dist/theme.js",
  "dist/background.js",
  "dist/content.js",
  "dist/dock.js",
  "tests/sites.json",
  "tests/e2e/dark-sites.spec.ts",
])
  fingerprint.update(await readFile(path));
const build = fingerprint.digest("hex");

// Public-site failure contracts: independently visible component contracts must
// survive recoloring. Readable text must retain >=4.5:1 contrast on opaque,
// uniform surfaces; media must retain its CSS filter; Off restores sampled
// colors. Reload must apply the saved request without reopening the panel.
for (const site of sites.filter(
  (site) => !filters || filters.includes(site.id),
)) {
  test(`Dark site: ${site.name}`, async () => {
    test.skip(!enabled, "Run npm run test:dark for public websites");
    if (filters?.some((id) => !sites.some((site) => site.id === id)))
      throw new Error("Unknown TAYLR_SITES filter");
    const directory = evidencePath("dark-sites", site.id);
    await mkdir(directory, { recursive: true });
    let instance;
    let phase = "launch";
    let access;
    let failure;
    let observedPage;
    const record: Record<string, unknown> = {
      site: site.id,
      url: site.url,
      build,
      startedAt: new Date().toISOString(),
      checks: [],
    };
    try {
      instance = await isolatedBrowser(site, { productionPermissions: true });
      const { context, extensionId } = instance;
      const resources = observeThemeResources(context);
      record.environment = instance.environment;
      record.runId = process.env.TAYLR_RUN_ID;
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: true,
      });
      const bridge = await driver(context, extensionId);
      const page = await context.newPage();
      observedPage = page;
      phase = "navigation";
      const response = await page.goto(site.url, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });
      access = await inspectAccess(page, response);
      if (access.blocked)
        throw new VerificationError(`Observed access block: ${access.title}`, {
          outcome: "blocked",
          phase,
          access,
        });
      phase = "readiness";
      if (site.readyUrl)
        await page.waitForURL((url) => url.href.includes(site.readyUrl), {
          timeout: 30000,
        });
      if (site.dismiss) {
        const dismiss = page.locator(site.dismiss);
        if (
          await dismiss
            .waitFor({ state: "visible", timeout: 15000 })
            .then(() => true)
            .catch(() => false)
        )
          await dismiss.click();
      }
      phase = "baseline";
      // Validate every declared component, including those below the fold.
      for (const contract of site.components) {
        const matches = page.locator(contract.target);
        const target =
          contract.targetIndex === undefined
            ? matches
            : matches.nth(contract.targetIndex);
        await expect(target).toHaveCount(1);
        await expect(target).toBeVisible();
      }
      await page.mouse.move(0, 0);
      phase = "readiness";
      const minimum = site.dark?.minTextSamples ?? 3;
      await expect
        .poll(
          () =>
            page.locator("p,a,h1,h2,h3,label,button,td,span").evaluateAll(
              (elements) =>
                elements.filter((el) => {
                  const r = el.getBoundingClientRect();
                  return (
                    el.checkVisibility({
                      opacityProperty: true,
                      visibilityProperty: true,
                      contentVisibilityAuto: true,
                    }) &&
                    r.top >= 0 &&
                    r.bottom <= innerHeight &&
                    r.left >= 0 &&
                    r.right <= innerWidth &&
                    r.width > 10 &&
                    r.height > 8 &&
                    [...el.childNodes].some(
                      (node) =>
                        node.nodeType === Node.TEXT_NODE &&
                        node.textContent?.trim().length > 4,
                    )
                  );
                }).length,
            ),
          { timeout: 20000, message: "Rendered text readiness" },
        )
        .toBeGreaterThanOrEqual(minimum);
      phase = "baseline";
      await page.screenshot({ path: `${directory}/before.png` });
      // Keep references, rather than matching different text after DOM updates.
      // Only opaque normal-blend foregrounds on solid backgrounds qualify for
      // contrast assertions; photos, gradients and alpha text are reported as
      // unsupported samples instead of receiving a fabricated ratio.
      await page.evaluate(() => {
        const roots: (Document | ShadowRoot)[] = [document];
        for (let n = 0; n < roots.length; n++)
          for (const el of roots[n].querySelectorAll("*"))
            if (el.shadowRoot) roots.push(el.shadowRoot);
        const elements = roots.flatMap((root) => [
          ...root.querySelectorAll("p,a,h1,h2,h3,label,button,td,span"),
        ]);
        const samples = elements
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return (
              el.checkVisibility({
                opacityProperty: true,
                visibilityProperty: true,
                contentVisibilityAuto: true,
              }) &&
              r.width > 10 &&
              r.height > 8 &&
              r.top >= 0 &&
              r.bottom <= innerHeight &&
              r.left >= 0 &&
              r.right <= innerWidth &&
              [...el.childNodes].some(
                (node) =>
                  node.nodeType === Node.TEXT_NODE &&
                  node.textContent?.trim().length > 4,
              ) &&
              getComputedStyle(el).visibility === "visible"
            );
          })
          .slice(0, 40);
        const contrast = (el: Element) => {
          const rgba = (value: string) => {
            const m = value.match(/^rgba?\(([^)]+)\)$/);
            return m ? m[1].split(",").map(Number) : null;
          };
          const style = getComputedStyle(el),
            fg = rgba(style.color);
          if (!fg || (fg[3] ?? 1) < 1 || style.mixBlendMode !== "normal")
            return null;
          let bg: number[] | null = null;
          let node: Element | null = el;
          while (node) {
            const s = getComputedStyle(node);
            if (
              (!bg && s.backgroundImage !== "none") ||
              s.mixBlendMode !== "normal" ||
              Number(s.opacity) < 1 ||
              s.filter !== "none"
            )
              return null;
            const color = rgba(s.backgroundColor);
            if (!bg && color && (color[3] ?? 1) === 1) bg = color;
            else if (!bg && color && (color[3] ?? 1) > 0) return null;
            node =
              node.parentElement ??
              (node.getRootNode() as ShadowRoot).host ??
              null;
          }
          bg ??= [255, 255, 255];
          const l = (rgb: number[]) =>
            rgb
              .slice(0, 3)
              .map((c) => c / 255)
              .map((c) =>
                c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
              )
              .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
          const f = l(fg),
            b = l(bg);
          return (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
        };
        const signature = (el: Element) => {
          const parts: string[] = [];
          let node: Element | null = el;
          while (node) {
            parts.push(
              [
                node.localName,
                node.getAttribute("class"),
                node.getAttribute("aria-selected"),
              ].join("|"),
            );
            node =
              node.parentElement ??
              (node.getRootNode() as ShadowRoot).host ??
              null;
          }
          return parts.join("/");
        };
        const measure = (el: Element) => ({
          connected: el.isConnected,
          visible: el.checkVisibility({
            opacityProperty: true,
            visibilityProperty: true,
            contentVisibilityAuto: true,
          }),
          signature: signature(el),
          text: el.textContent?.trim().slice(0, 80),
          color: getComputedStyle(el).color,
          background: getComputedStyle(el).backgroundColor,
          contrast: contrast(el),
          width: el.getBoundingClientRect().width,
        });
        const media = roots
          .flatMap((root) => [...root.querySelectorAll("img,canvas,video")])
          .filter((el) => el.getClientRects().length)
          .slice(0, 20);
        window.__darkVerification = {
          samples,
          media,
          measure,
          before: samples.map(measure),
          mediaBefore: media.map((el) => getComputedStyle(el).filter),
        };
      });
      const baseline = await page.evaluate(
        () => window.__darkVerification.before,
      );
      record.before = baseline;
      expect(baseline.length, "Visible text samples").toBeGreaterThanOrEqual(
        minimum,
      );
      const dock = await openDock(context, bridge, page);
      const dark = dock.locator("#dark-mode");
      phase = "theme";
      resources.resetQuietWindow();
      const observationStarted = Date.now();
      await dark.click();
      await expect(dark).toHaveAttribute("aria-pressed", "true");
      await expect(dark).toContainText("On", { timeout: 20000 });
      await expect(page.locator("html")).toHaveAttribute(
        "data-darkreader-mode",
        "dynamic",
      );
      // Require a stable color window, not a single passing animation frame.
      // CDN overrides and native transitions can briefly pass, then change again.
      const readableRegressions = (samples: Sample[]) =>
        samples.flatMap((sample, index) =>
          sample.connected &&
          sample.visible &&
          (baseline[index].contrast ?? 0) >= 4.5 &&
          (sample.contrast === null || sample.contrast < 4.45)
            ? [{ before: baseline[index], after: sample }]
            : [],
        );
      let after: Sample[] = [];
      let previous: Sample[] = [];
      const stableColors = baseline.map(() => 0);
      await expect
        .poll(
          async () => {
            after = await page.evaluate(() =>
              window.__darkVerification.samples.map(
                window.__darkVerification.measure,
              ),
            );
            after.forEach((sample, index) => {
              const old = previous[index];
              const same =
                old &&
                sample.connected &&
                sample.visible &&
                old.color === sample.color &&
                old.background === sample.background &&
                old.contrast === sample.contrast;
              stableColors[index] = same ? stableColors[index] + 1 : 0;
            });
            previous = after;
            record.after = after;
            record.resources = resources.snapshot();
            record.observationMs = Date.now() - observationStarted;
            record.settledSamples = stableColors.filter(
              (count) => count >= 3,
            ).length;
            return {
              settled:
                Number(record.observationMs) >= 8000 &&
                resources.quiet() &&
                Number(record.settledSamples) >= minimum,
              regressions: readableRegressions(after),
            };
          },
          {
            timeout: 20000,
            intervals: [100, 200, 300, 500],
            message: "Stable readable text after asynchronous CSS",
          },
        )
        .toEqual({ settled: true, regressions: [] });
      const media = await page.evaluate(() => {
        const v = window.__darkVerification;
        return {
          before: v.mediaBefore,
          after: v.media.map((el: Element) =>
            el.isConnected ? getComputedStyle(el).filter : null,
          ),
        };
      });
      record.before = baseline;
      record.after = after;
      record.media = media;
      record.excludedMedia = media.after.filter(
        (value) => value === null,
      ).length;
      expect(
        media.after
          .flatMap((value, index) =>
            value === null ? [] : [[value, media.before[index]]],
          )
          .filter(([after, before]) => after !== before),
        "Surviving media CSS filters",
      ).toEqual([]);
      record.contrastRegressions = readableRegressions(after);
      record.contrastSamples = after.filter(
        (sample, index) =>
          sample.connected &&
          sample.visible &&
          (baseline[index].contrast ?? 0) >= 4.5 &&
          sample.contrast !== null,
      ).length;
      record.unsupportedContrastSamples = after.filter(
        (sample) => sample.contrast === null,
      ).length;
      for (const contract of site.components) {
        const targets = page.locator(contract.target);
        await expect(
          contract.targetIndex === undefined
            ? targets
            : targets.nth(contract.targetIndex),
        ).toBeVisible();
      }
      await expect(page.locator("html")).toHaveCSS("filter", "none");
      await page.screenshot({ path: `${directory}/dark.png` });
      phase = "restore";
      await dark.click();
      await expect(page.locator("html")).not.toHaveAttribute(
        "data-darkreader-mode",
        "dynamic",
      );
      await page.mouse.move(0, 0);
      let restored: Sample[] = [];
      await expect
        .poll(
          async () => {
            restored = await page.evaluate(() =>
              window.__darkVerification.samples.map(
                window.__darkVerification.measure,
              ),
            );
            return restored.flatMap((sample, index) =>
              sample.connected &&
              sample.visible &&
              (sample.signature === baseline[index].signature ||
                (sample.color === baseline[index].color &&
                  sample.background === baseline[index].background)) &&
              sample.text === baseline[index].text &&
              (sample.color !== baseline[index].color ||
                sample.background !== baseline[index].background)
                ? [{ before: baseline[index], after: sample }]
                : [],
            );
          },
          {
            timeout: 15000,
            message: "Off restores surviving, unchanged samples",
          },
        )
        .toEqual([]);
      record.restored = restored;
      const stable = restored.filter(
        (sample, index) =>
          sample.connected &&
          sample.visible &&
          (sample.signature === baseline[index].signature ||
            (sample.color === baseline[index].color &&
              sample.background === baseline[index].background)) &&
          sample.text === baseline[index].text,
      );
      const changed = baseline.map(
        (sample, index) =>
          after[index].connected &&
          after[index].visible &&
          (after[index].color !== sample.color ||
            after[index].background !== sample.background),
      );
      const changedRestored = restored.filter(
        (sample, index) =>
          changed[index] &&
          sample.connected &&
          sample.visible &&
          sample.text === baseline[index].text &&
          sample.color === baseline[index].color &&
          sample.background === baseline[index].background,
      ).length;
      record.changedRestorationSamples = changedRestored;
      if (changed.some(Boolean))
        expect(
          changedRestored,
          "Changed theme samples restore",
        ).toBeGreaterThan(0);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const roots: (Document | ShadowRoot)[] = [document];
            for (let n = 0; n < roots.length; n++)
              for (const el of roots[n].querySelectorAll("*"))
                if (
                  el.shadowRoot &&
                  !["taylr-tools", "taylr-highlight"].includes(el.localName)
                )
                  roots.push(el.shadowRoot);
            return roots.flatMap((root) => [
              ...root.querySelectorAll(
                "style.darkreader,meta[name=darkreader]",
              ),
            ]).length;
          }),
        )
        .toBe(0);
      record.restorationSamples = stable.length;
      record.excludedRestorationSamples = baseline.length - stable.length;
      expect(
        stable.length,
        "Stable restoration samples",
      ).toBeGreaterThanOrEqual(minimum);
      await page.screenshot({ path: `${directory}/restored.png` });
      await dark.click();
      await expect(dark).toContainText("On");
      phase = "persistence";
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.locator("html")).toHaveAttribute(
        "data-darkreader-mode",
        "dynamic",
        { timeout: 20000 },
      );
      record.outcome = "passed";
      record.checks = [
        "all-component-baselines",
        record.contrastSamples ? "sampled-contrast" : "contrast-unmeasurable",
        "media-filters",
        "component-visibility",
        "no-root-filter",
        "color-restoration",
        "reload-persistence",
      ];
    } catch (cause) {
      await observedPage
        ?.screenshot({ path: `${directory}/failure.png` })
        .catch(() => {});
      record.documentColors = await observedPage
        ?.evaluate(() =>
          [
            ...document.querySelectorAll(
              "html,body,main,#hnmain,#content,.container",
            ),
          ].map((el) => ({
            tag: el.localName,
            id: el.id,
            bg: getComputedStyle(el).backgroundColor,
            fg: getComputedStyle(el).color,
          })),
        )
        .catch(() => null);
      const laterAccess = observedPage
        ? await inspectAccess(observedPage)
        : undefined;
      if (laterAccess?.blocked) access = laterAccess;
      failure = classifyFailure(cause, phase, access);
      record.outcome = failure.outcome;
      record.phase = phase;
      record.error = failure.message;
      record.access = access;
    } finally {
      try {
        await instance?.context.tracing.stop({
          path: `${directory}/trace.zip`,
        });
      } catch (cause) {
        record.artifactError = String(cause);
        failure ??= classifyFailure(cause, "artifacts");
        record.outcome = failure.outcome;
      }
      try {
        await instance?.close();
      } catch (cause) {
        record.cleanupError = String(cause);
        failure ??= classifyFailure(cause, "cleanup");
        record.outcome = failure.outcome;
      }
      record.completedAt = new Date().toISOString();
      await writeFile(
        `${directory}/result.json`,
        JSON.stringify(record, null, 2),
      );
      await test.info().attach("dark-site-result", {
        body: JSON.stringify(record),
        contentType: "application/json",
      });
    }
    if (failure?.outcome === "blocked") test.skip(true, failure.message);
    if (failure) throw failure;
  });
}
