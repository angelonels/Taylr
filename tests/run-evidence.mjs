import { join } from "node:path";

export const runRoot = process.env.TAYLR_RUN_ROOT ?? "output/playwright";
export const evidencePath = (...parts) => join(runRoot, ...parts);

export class VerificationError extends Error {
  constructor(message, { outcome, phase, access, cause } = {}) {
    super(message, { cause });
    this.name = "VerificationError";
    this.outcome = outcome;
    this.phase = phase;
    this.access = access;
  }
}

// Only positive observations qualify as access blocks. Network failures are infrastructure evidence.
export async function inspectAccess(page, response) {
  const observed = await page
    .evaluate(() => {
      const visible = (element) =>
        !!element.getClientRects().length &&
        getComputedStyle(element).visibility !== "hidden";
      return {
        title: document.title,
        text: (document.body?.innerText ?? "").slice(0, 6000),
        securityFrame: [...document.querySelectorAll("iframe[src]")].some(
          (element) =>
            visible(element) &&
            /captcha-delivery\.com|challenges\.cloudflare\.com/.test(
              element.src,
            ),
        ),
        loginDialog: [...document.querySelectorAll('[role="dialog"]')].some(
          (element) =>
            visible(element) &&
            /log in|sign up/i.test(element.textContent ?? ""),
        ),
      };
    })
    .catch(() => ({ title: "", text: "" }));
  const status = response?.status();
  const challenge =
    /prove your humanity|just a moment|access denied|robot check|captcha|security check|pardon our interruption|attention required/i.test(
      observed.title,
    ) ||
    /unusual traffic|blocked by network security|request blocked|enable JavaScript and cookies|too many requests|not available in your (country|region)/i.test(
      observed.text,
    ) ||
    observed.securityFrame;
  return {
    ...observed,
    status,
    blocked: challenge || [401, 403, 429, 503].includes(status),
  };
}

export function classifyFailure(error, phase, access) {
  if (error.outcome) return error;
  const outcome = access?.blocked
    ? "blocked"
    : /net::ERR_|HTTP_RESPONSE_CODE_FAILURE|page\.goto: Timeout/.test(
          error.message,
        )
      ? "environment-error"
      : ["navigation", "readiness"].includes(phase)
        ? "environment-error"
        : phase === "baseline"
          ? "contract-failed"
          : ["artifacts", "launch", "cleanup"].includes(phase)
            ? "harness-error"
            : "product-failed";
  return new VerificationError(error.message, {
    outcome,
    phase,
    access,
    cause: error,
  });
}
