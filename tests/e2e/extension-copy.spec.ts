import { test, expect } from "@playwright/test";
import { mkdtemp, cp, symlink, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { evidencePath } from "../run-evidence.mjs";

// A symlinked build must still yield a private extension copy. Test-only
// manifest and worker patches must never write back into the source build.
test("Disposable extension patches cannot follow a build symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "taylr-copy-contract-"));
  const pristine = join(root, "pristine");
  try {
    await cp(resolve("dist"), pristine, { recursive: true, dereference: true });
    await symlink(pristine, join(root, "dist"), "dir");
    const files = ["manifest.json", "background.js"];
    const before = await Promise.all(
      files.map((name) => readFile(join(pristine, name), "utf8")),
    );
    const helper = pathToFileURL(
      fileURLToPath(new URL("../isolated-browser.mjs", import.meta.url)),
    ).href;
    const script = `
      import { isolatedBrowser } from ${JSON.stringify(helper)};
      const instance = await isolatedBrowser();
      try {
        await instance.context.tracing.start({ screenshots: true, snapshots: true, sources: true });
        const page = await instance.context.newPage();
        await page.goto('chrome-extension://' + new URL(instance.worker.url()).host + '/test-driver.html');
        console.log(await instance.worker.evaluate(() => typeof globalThis.__invokeTaylrAction));
        await instance.context.tracing.stop({ path: process.env.TAYLR_COPY_TRACE });
      } finally {
        await instance.close();
      }
    `;
    const child = await promisify(execFile)(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        cwd: root,
        env: {
          ...process.env,
          TAYLR_COPY_TRACE: resolve(evidencePath("extension-copy.zip")),
        },
        timeout: 30000,
      },
    );
    expect(child.stdout.trim()).toBe("function");
    for (let index = 0; index < files.length; index++)
      expect(
        await readFile(join(pristine, files[index]), "utf8"),
        `${files[index]} must stay unchanged`,
      ).toBe(before[index]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
