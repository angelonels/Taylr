# Taylr

Hide page elements and restore them later. Rules and cropped previews stay on your device.

## Use

Click Taylr’s Chrome toolbar icon to open the floating panel.

- **Hide:** click a page element, or use ↑/↓ to select its parent/child and Enter to hide. Escape, Cancel or Done ends selection.
- **Undo:** reverse changes from the current selection session.
- **Rules:** inspect local previews and restore one element or all rules for this site.
- **Site:** pause/resume hiding without deleting rules, or open Chrome’s access settings.
- **Move:** drag the grip, click it to switch edges, or focus it and use arrow keys. Home resets placement. Close dismisses the panel.

Rules apply to an exact origin (scheme, hostname and port). Installation requests HTTP/HTTPS access; Chrome controls the actual grant. Internal pages, the Web Store, iframe interiors and shadow-root interiors are unsupported. Website changes can invalidate saved selectors.

Regular rules and pause settings use local storage. Private rules, previews and pause settings use isolated session storage and clear on browser restart or extension reload. Panel position and disclosures are transient. No account, server or telemetry is involved.

## Develop

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run build
```

In the approved development browser, open `chrome://extensions`, enable Developer mode and load this project’s `dist` directory. After rebuilding, explicitly reload the extension. Finish private customization first: extension reload clears private rules. Existing page documents may need refreshing to load new injected code; save their work first.

The React/TypeScript/Tailwind panel loads on demand, inside Shadow DOM. The picker and rule restoration remain independent of React. `npm run dev` serves fixtures; it does not reload installed extensions. Generated builds, browser data and evidence stay outside Git.

## Verify

```sh
npx playwright install chromium
npm run check
npm run format:check
npm run test:e2e -- --workers=2
```

Tests build once and launch disposable Chromium with temporary data. Reports and traces live under `output/playwright/runs/`; `output/playwright/latest-run.json` locates the latest run. CI runs the local gate on pushes and pull requests and retains test/build artifacts.

Opt-in public-site checks: `npm run test:canary`, `npm run test:live`, and `npm run test:compare`. See [testing](docs/testing.md) for filters and outcome semantics, [the matrix](docs/site-test-matrix.md) for coverage, and [decisions](docs/decisions.md) for architecture and constraints.
