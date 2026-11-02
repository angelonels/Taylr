# Verification rationale

E2E exercises the extension through real browser rendering and storage boundaries. Owned fixtures provide repeatable failures; public contracts test integration with different DOM and rendering models. Neither substitutes for the other.

- Launch one disposable browser per case. Temporary extension copies may narrow host access; production-permission acceptance retains the generated manifest. [Playwright isolation](https://playwright.dev/docs/browser-contexts)
- Test observable application readiness, exact component identity and retained state. Global network idle is unreliable for streaming apps; hydration can outlast a visible shell. [Playwright best practices](https://playwright.dev/docs/best-practices)
- Native CDP evidence capture avoids waiting for unrelated fonts without changing website resources or protections. Scrolled crops must convert viewport geometry to document coordinates. [Screenshot API](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureScreenshot)
- Keep checkpoint records alongside traces: manually collected traces do not contain Playwright Test assertions. Successful live traces are optional because their storage cost is substantial. [Tracing](https://playwright.dev/docs/api/class-tracing)
- Distinguish external access, environment, contract, product and harness failures. Cleanup and artifact failures cannot leave a passing session record. Browser protection remains enabled.
- Require build, harness, contract and environment identity before combining runs. Newest qualifying failures and blocks take precedence over older passes; retries cannot turn incompatible evidence into coverage.
- Prefer headless isolation. Visible disposable browsers can receive unrelated desktop pointer input; a contaminated trajectory does not prove a picker defect or justify ignoring trusted user motion.

The action bridge cannot prove a native Chrome activeTab gesture. Renderer-dispatched keyboard input may not invoke browser commands; native-action coverage remains explicitly unresolved. [Chrome action commands](https://developer.chrome.com/docs/extensions/reference/api/commands#action_commands)

Commands, acceptance contracts and evidence locations live in [testing](../testing.md). Coverage belongs in [the matrix](../site-test-matrix.md).
