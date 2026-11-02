import { test, expect, type Locator, type Page } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure hypotheses: disabled native controls suppress click; a later modal
// intercepts dock input; the picker outline is obscured by the native top layer.
const url = "http://127.0.0.1:5173/picker-native-boundaries";
const fixture = `<!doctype html><title>Native picker boundaries</title>
<style>
body{margin:0;background:#eee;font:16px sans-serif}button{font:inherit}
#disabled,#neighbor{position:absolute;left:70px;width:220px;height:70px}
#disabled{top:90px;padding:0}#disabled span{display:grid;place-items:center;width:100%;height:100%}#neighbor{top:200px}
dialog{position:fixed;inset:80px auto auto 60px;margin:0;width:430px;padding:32px;border:0;background:white}
dialog::backdrop{background:rgba(20,30,40,.5)}
#modal-target{width:300px;height:100px;background:#e2e6ed;margin:30px 0;display:grid;place-items:center}
</style><div id="fullscreen-shell"><button id="enter-fullscreen" style="position:fixed;left:70px;bottom:40px">Enter fullscreen</button><button id="disabled" disabled><span id="disabled-label">Disabled native button</span></button>
<button id="neighbor">Unchanged neighbor</button>
<dialog id="modal"><h1>Native dialog</h1><div id="modal-target">Dialog component</div><button id="modal-neighbor">Unchanged dialog neighbor</button><dialog id="nested"><h2>Second native modal</h2><button id="nested-neighbor">Nested neighbor</button></dialog></dialog></div>`;

async function center(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "Fixture target must have a rendered box").not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

async function ready(dock: Locator, mode: "edit" | "hide") {
  await dock.locator(`#${mode}`).click();
  await expect(dock.locator(`#${mode}`)).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(dock.locator("#hide")).toHaveAttribute("aria-busy", "false");
}

async function showModal(page: Page) {
  await page
    .locator("#modal")
    .evaluate((element) => (element as HTMLDialogElement).showModal());
  await expect(page.locator("#modal")).toBeVisible();
}

for (const scenario of [
  "disabled-edit",
  "disabled-hide",
  "disabled-nested-once",
  "disabled-drag",
  "disabled-modifiers",
  "dialog-edit",
  "later-dialog-dock",
  "modal-transitions",
  "modal-unmount",
  "fullscreen",
] as const) {
  test(`Native picker boundary: ${scenario}`, async () => {
    const instance = await isolatedBrowser();
    const { context, extensionId } = instance;
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
    let page: Page | undefined;
    try {
      await context.route(url, (route) =>
        route.fulfill({ contentType: "text/html", body: fixture }),
      );
      const bridge = await driver(context, extensionId);
      page = await context.newPage();
      await page.goto(url);
      if (scenario === "dialog-edit") await showModal(page);
      if (scenario === "fullscreen") {
        await page.locator("#enter-fullscreen").evaluate((element) => {
          element.addEventListener(
            "click",
            (event) => {
              const button = element as HTMLButtonElement;
              button.dataset.trusted = String(event.isTrusted);
              const surface =
                document.querySelector<HTMLElement>("#fullscreen-shell")!;
              if (
                !document.fullscreenEnabled ||
                typeof surface.requestFullscreen !== "function"
              ) {
                button.dataset.result = "unsupported";
                button.dataset.reason =
                  "Fullscreen API unavailable or fullscreenEnabled is false";
                return;
              }
              surface.requestFullscreen().then(
                () => {
                  button.dataset.result = "entered";
                },
                (error) => {
                  button.dataset.result =
                    error.name === "NotSupportedError"
                      ? "unsupported"
                      : "rejected";
                  button.dataset.reason = `${error.name}: ${error.message}`;
                },
              );
            },
            { once: true },
          );
        });
        await page.locator("#enter-fullscreen").click();
        await expect(page.locator("#enter-fullscreen")).toHaveAttribute(
          "data-trusted",
          "true",
        );
        await expect(page.locator("#enter-fullscreen")).toHaveAttribute(
          "data-result",
          /entered|unsupported|rejected/,
        );
        const result = await page
          .locator("#enter-fullscreen")
          .getAttribute("data-result");
        const reason = await page
          .locator("#enter-fullscreen")
          .getAttribute("data-reason");
        test.skip(
          result === "unsupported",
          `Disposable browser fullscreen unsupported: ${reason}`,
        );
        expect(result, `Trusted fullscreen request rejected: ${reason}`).toBe(
          "entered",
        );
        await expect
          .poll(() => page!.evaluate(() => document.fullscreenElement?.id))
          .toBe("fullscreen-shell");
      }
      const dock = await openDock(context, bridge, page);

      if (scenario.startsWith("disabled-")) {
        const mode = scenario === "disabled-edit" ? "edit" : "hide";
        await ready(dock, mode);
        const target = page.locator("#disabled");
        await expect(target).toBeDisabled();
        const point = await center(target);
        await page.mouse.move(point.x, point.y);
        // Physical trusted mouse input bypasses Playwright's enabled check,
        // without fabricating the click event that this regression investigates.
        if (scenario === "disabled-nested-once") {
          await expect
            .poll(() =>
              page!.evaluate(
                ({ x, y }) => document.elementFromPoint(x, y)?.id,
                point,
              ),
            )
            .toBe("disabled-label");
        }
        if (scenario === "disabled-drag") {
          await page.mouse.down();
          await page.mouse.move(point.x + 260, point.y + 100, { steps: 4 });
          await page.mouse.move(point.x, point.y, { steps: 4 });
          await page.mouse.up();
          await expect(target).toBeVisible();
          await expect(dock.locator("#undo")).toBeDisabled();
          await expect(dock.locator("#hide")).toHaveAttribute(
            "aria-pressed",
            "true",
          );
          // A following legitimate click proves that ignoring the drag did not
          // leave the picker stuck in a held-pointer state.
        } else if (scenario === "disabled-modifiers") {
          for (const modifier of ["Alt", "Control", "Meta", "Shift"]) {
            await page.keyboard.down(modifier);
            try {
              await page.mouse.click(point.x, point.y);
            } finally {
              await page.keyboard.up(modifier);
            }
            await expect(target).toBeVisible();
            await expect(dock.locator("#undo")).toBeDisabled();
            await expect(dock.locator("#hide")).toHaveAttribute(
              "aria-pressed",
              "true",
            );
          }
          await page.mouse.click(point.x, point.y, { button: "right" });
          await expect(target).toBeVisible();
          await expect(dock.locator("#undo")).toBeDisabled();
          await page.keyboard.press("Escape");
          if (
            (await dock.locator("#hide").getAttribute("aria-pressed")) !==
            "true"
          )
            await ready(dock, "hide");
        }
        await page.mouse.click(point.x, point.y);
        if (mode === "edit") {
          await expect(
            dock.getByRole("region", { name: "Element editor" }),
          ).toBeVisible();
          await dock.locator("#edit-opacity").fill("40");
          await expect(target).toHaveCSS("opacity", "0.4");
          await expect(page.locator("#neighbor")).toHaveCSS("opacity", "1");
        } else {
          await expect(target).toBeHidden();
          if (scenario === "disabled-nested-once") {
            await dock.locator("#undo").click();
            await expect(target).toBeVisible();
            await expect(dock.locator("#undo")).toBeDisabled();
          }
        }
        await expect(page.locator("#neighbor")).toBeVisible();
        await expect(page.locator("#neighbor")).toHaveText(
          "Unchanged neighbor",
        );
      } else if (scenario === "dialog-edit") {
        await ready(dock, "edit");
        const target = page.locator("#modal-target");
        const point = await center(target);
        await page.mouse.move(point.x, point.y);
        await expect(
          page.locator("taylr-highlight").locator(".outline"),
        ).toBeVisible();
        // This captures actual painted pixels for review. DOM visibility alone
        // cannot establish that a pointer-transparent outline paints above a modal.
        await page.screenshot({
          path: evidencePath("picker-native-dialog-outline.png"),
          animations: "disabled",
        });
        await page.mouse.click(point.x, point.y);
        await expect(
          dock.getByRole("region", { name: "Element editor" }),
        ).toBeVisible();
        await dock.locator("#edit-opacity").fill("40");
        await expect(target).toHaveCSS("opacity", "0.4");
        await expect(page.locator("#modal-neighbor")).toBeVisible();
        await expect(page.locator("#modal-neighbor")).toHaveCSS("opacity", "1");
      } else if (scenario === "modal-unmount" || scenario === "fullscreen") {
        if (scenario === "modal-unmount") {
          await showModal(page);
          // React-style unmount: no dialog.close() and no synthetic toggle.
          await page.locator("#modal").evaluate((element) => element.remove());
          await expect(page.locator("#modal")).toHaveCount(0);
        }
        for (const stage of scenario === "fullscreen"
          ? ["entered", "exited"]
          : ["unmounted"]) {
          if (stage === "exited") {
            await page.evaluate(() => document.exitFullscreen());
            await expect
              .poll(() =>
                page!.evaluate(() => document.fullscreenElement === null),
              )
              .toBe(true);
          }
          await expect(dock.locator("#hide")).toBeVisible();
          const point = await center(dock.locator("#hide"));
          await expect
            .poll(
              () =>
                page!.evaluate(({ x, y }) => {
                  const host = document.querySelector("taylr-tools");
                  return (
                    document.elementFromPoint(x, y) === host &&
                    !!host?.shadowRoot?.elementFromPoint(x, y)?.closest("#hide")
                  );
                }, point),
              { message: `Dock must receive real input after ${stage}` },
            )
            .toBe(true);
          await page.mouse.click(point.x, point.y);
          await expect(dock.locator("#hide")).toHaveAttribute(
            "aria-pressed",
            "true",
          );
          await expect(dock.locator("#hide")).toHaveAttribute(
            "aria-busy",
            "false",
          );
          const target = page.locator("#disabled");
          const targetPoint = await center(target);
          await page.mouse.click(targetPoint.x, targetPoint.y);
          await expect(target).toBeHidden();
          await expect(page.locator("#neighbor")).toBeVisible();
          await dock.locator("#undo").click();
          await expect(target).toBeVisible();
          await expect(dock.locator("#undo")).toBeDisabled();
          // Undo keeps the picker active; end this stage before testing re-entry.
          await dock.locator("#hide").click();
          await expect(dock.locator("#hide")).toHaveAttribute(
            "aria-pressed",
            "false",
          );
        }
      } else if (scenario === "modal-transitions") {
        await showModal(page);
        for (const stage of ["first", "nested", "outer-again", "closed"]) {
          if (stage === "nested")
            await page
              .locator("#nested")
              .evaluate((element) =>
                (element as HTMLDialogElement).showModal(),
              );
          if (stage === "outer-again") {
            await page
              .locator("#nested")
              .evaluate((element) => (element as HTMLDialogElement).close());
            await expect(page.locator("#modal")).toBeVisible();
          }
          if (stage === "closed")
            await page
              .locator("#modal")
              .evaluate((element) => (element as HTMLDialogElement).close());
          const point = await center(dock.locator("#hide"));
          await expect
            .poll(
              () =>
                page!.evaluate(({ x, y }) => {
                  const host = document.querySelector("taylr-tools");
                  return (
                    document.elementFromPoint(x, y) === host &&
                    !!host?.shadowRoot?.elementFromPoint(x, y)?.closest("#hide")
                  );
                }, point),
              { message: `Dock must receive input at modal stage ${stage}` },
            )
            .toBe(true);
          await page.mouse.click(point.x, point.y);
          await expect(dock.locator("#hide")).toHaveAttribute(
            "aria-pressed",
            "true",
          );
          await expect(dock.locator("#hide")).toHaveAttribute(
            "aria-busy",
            "false",
          );
          await page.mouse.click(point.x, point.y);
          await expect(dock.locator("#hide")).toHaveAttribute(
            "aria-pressed",
            "false",
          );
        }
        await expect(page.locator("#neighbor")).toBeVisible();
      } else {
        await showModal(page);
        const point = await center(dock.locator("#hide"));
        await page.screenshot({
          path: evidencePath("picker-later-dialog-dock.png"),
          animations: "disabled",
        });
        await expect
          .poll(
            () =>
              page!.evaluate(({ x, y }) => {
                const host = document.querySelector("taylr-tools");
                if (document.elementFromPoint(x, y) !== host) return false;
                return !!host?.shadowRoot
                  ?.elementFromPoint(x, y)
                  ?.closest("#hide");
              }, point),
            {
              message:
                "Hide must receive physical input after a later native modal opens",
            },
          )
          .toBe(true);
        await page.mouse.click(point.x, point.y);
        await expect(dock.locator("#hide")).toHaveAttribute(
          "aria-pressed",
          "true",
        );
        await expect(dock.locator("#hide")).toHaveAttribute(
          "aria-busy",
          "false",
        );
        await expect(page.locator("#modal-neighbor")).toBeVisible();
      }
    } finally {
      try {
        if (page && !page.isClosed())
          await page.screenshot({
            path: evidencePath(`picker-native-${scenario}.png`),
            animations: "disabled",
          });
      } finally {
        try {
          await context.tracing.stop({
            path: evidencePath(`picker-native-${scenario}-trace.zip`),
          });
        } finally {
          await instance.close();
        }
      }
    }
  });
}
