import type { BrowserContext, Request } from "@playwright/test";

// Observe the disposable browser's actual stylesheet and extension-worker
// requests, including response bodies. Header arrival alone is not completion.
export function observeThemeResources(context: BrowserContext) {
  const pending = new Set<Request>();
  let changedAt = Date.now();
  context.on("request", (request) => {
    if (
      request.resourceType() === "stylesheet" ||
      request.serviceWorker()?.url().startsWith("chrome-extension://")
    ) {
      pending.add(request);
      changedAt = Date.now();
    }
  });
  const finish = (request: Request) => {
    if (pending.delete(request)) changedAt = Date.now();
  };
  context.on("requestfinished", finish);
  context.on("requestfailed", finish);
  return {
    resetQuietWindow() {
      changedAt = Date.now();
    },
    quiet() {
      return pending.size === 0 && Date.now() - changedAt >= 1000;
    },
    snapshot() {
      return { pending: pending.size, quietForMs: Date.now() - changedAt };
    },
  };
}
