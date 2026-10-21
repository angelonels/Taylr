import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";

// Keep one approved CDP connection alive across repeated CLI runs. Never auto-reconnect.
const sites = JSON.parse(
  await readFile(new URL("../tests/sites.json", import.meta.url), "utf8"),
);
const extensionId = process.env.TAYLR_EXTENSION_ID;
if (!extensionId || !process.env.TAYLR_CDP_URL)
  throw new Error(
    "Set TAYLR_EXTENSION_ID and TAYLR_CDP_URL. See docs/testing.md.",
  );
console.log(
  "Connecting once to the approved Chrome instance. Keep this process running between test runs.",
);
const browser = await chromium.connectOverCDP(process.env.TAYLR_CDP_URL, {
  timeout: 120000,
});
// Explicit development reload only: never clear private rules as part of a test run.
if (process.env.TAYLR_RELOAD_BUILD === "1") {
  // Reload our unpacked build through Chrome's developer API; keep the CDP connection alive.
  const setup = await browser.contexts()[0].newPage();
  try {
    await setup.goto("chrome://extensions");
    await setup.evaluate(
      (id) =>
        new Promise((resolve, reject) =>
          chrome.developerPrivate.reload(id, { failQuietly: true }, () =>
            chrome.runtime.lastError
              ? reject(new Error(chrome.runtime.lastError.message))
              : resolve(),
          ),
        ),
      extensionId,
    );
  } finally {
    await setup.close();
  }
}
const token = randomBytes(32).toString("hex");
let connected = true;
browser.on("disconnected", () => {
  connected = false;
  console.error("Chrome disconnected. No reconnect was attempted.");
});
let pending = Promise.resolve();
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.headers.origin || req.headers.authorization !== `Bearer ${token}`) {
    res.writeHead(403);
    res.end("{}");
    return;
  }
  if (req.url === "/status") {
    res.end(JSON.stringify({ connected }));
    return;
  }
  if (req.method !== "POST" || req.url !== "/run") {
    res.writeHead(404);
    res.end("{}");
    return;
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 1024) {
      res.writeHead(413);
      res.end("{}");
      return;
    }
    chunks.push(chunk);
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    res.writeHead(400);
    res.end("{}");
    return;
  }
  const site = sites.find((site) => site.id === payload.site);
  if (payload.site !== "fixture" && !site) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "Unknown test site" }));
    return;
  }
  pending = pending
    .then(async () => {
      const startedAt = new Date().toISOString();
      let result;
      try {
        if (!connected)
          throw new Error(
            "Browser session disconnected. Start a session explicitly; tests will not reconnect.",
          );
        const { runFixture } = await import(
          `../tests/scenarios/fixture.mjs?revision=${Date.now()}`
        );
        const { runLiveSite } = await import(
          `../tests/scenarios/live.mjs?revision=${Date.now()}`
        );
        result =
          payload.site === "fixture"
            ? (await runFixture(browser, extensionId),
              { passed: true, site: "fixture" })
            : await runLiveSite(browser, extensionId, site);
      } catch (error) {
        result = { passed: false, site: payload.site, error: error.message };
      }
      result = { ...result, startedAt, completedAt: new Date().toISOString() };
      await mkdir("output/playwright/session-results", { recursive: true });
      await writeFile(
        `output/playwright/session-results/${payload.site}.json`,
        JSON.stringify(result, null, 2),
      );
      res.end(JSON.stringify(result));
    })
    .catch((error) => {
      res.statusCode = 500;
      res.end(JSON.stringify({ passed: false, error: error.message }));
    });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
await mkdir(".local", { recursive: true });
await writeFile(
  ".local/browser-session.json",
  JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, token }),
  { mode: 0o600 },
);
console.log(
  "Browser session ready. Run npm run test:e2e in another terminal. No new CDP connections are made per test run.",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    server.close();
    await browser.close();
    process.exit(0);
  });
