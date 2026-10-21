# Taylr

A local browser tool for hiding selected page elements and restoring them later.

## Develop

The floating dock uses React/TypeScript, Tailwind CSS, and Motion. The injected picker and rule restoration remain independent of that runtime.

Requires Node.js 22.12+ (or 20.19+) and npm.

```sh
npm ci
npm run build
```

For a manual installation, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this project's `dist` directory. Rebuild and reload the extension after source changes. Refresh already-open website tabs after an extension update so they use the new picker.

Open a website and click Taylr’s Chrome toolbar icon. The floating dock opens without changing the page width. Allow access to that site, then choose **Hide** and click an element. Use Parent/Child or ↑/↓ to refine selection; Enter hides it. **Cancel** or Escape exits selection, **Done** finishes, and **Close** dismisses the dock. Escape from the compact dock also closes it. **Undo** reverses your own changes from the current selection session.

Drag the grip to move the dock, click it to switch edges, or focus it and use arrow keys (Home resets its position). **Rules** shows hidden components with local visual previews and individual Restore controls. **Restore all** reveals everything hidden on that site. Captures contain the visible portion of the component; a label remains when Chrome cannot capture a preview.

Rules apply across pages of the same exact origin and remain on this device. Browser internal pages and the Chrome Web Store cannot be edited. Shadow-root interiors and iframe interiors are not supported yet. Site redesigns can invalidate selectors; Restore is always available.

## Verify

```sh
npx playwright install chromium
npm run build
npm run test:e2e
npm run test:live -- --workers=2
npm run test:report
```

Tests launch disposable Playwright Chromium with temporary data and never connect to personal Chrome profiles. No CDP setup or permission approvals are needed. For a visible disposable browser, set `TAYLR_HEADED=1`. Filter by `TAYLR_SITES` and `TAYLR_COMPONENTS` when investigating a recorded failure. Evidence stays under `output/playwright/`, outside Git.

The [component regression matrix](docs/site-test-matrix.md) explains the deliberate site/component choices and distinguishes verified contracts, access blocks, and pending validation. See [testing](docs/testing.md) for the acceptance contract and [foundation decisions](docs/decisions.md) for scope and tradeoffs.

Private-window rules are separate from regular rules and temporary: Chrome restart or extension reload clears them. Normal-window rules remain saved locally.
