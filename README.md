# Taylr

Hide selected page elements and restore them later. Rules and cropped component previews stay on your device.

## Use Taylr

Click Taylr’s Chrome toolbar icon on a website. Its vertical floating panel initially opens at the upper-right without changing the page width.

- **Hide** starts selection. Click an element to hide it, or use ↑/↓ to select its parent/child and Enter to hide it. **Cancel**, **Done**, and Escape finish selection.
- **Undo** reverses your changes from the current selection session.
- **Rules** lists hidden components with local previews. Restore one component or choose **Restore all** for the current site. Expand a preview to inspect its original pixels; text remains available when capture fails.
- **Site**, the fourth action, opens **Pause site / Resume site** and **Chrome access settings**. Pause reveals the site's hidden elements across open tabs and keeps its saved rules. Resume reapplies them. Pause is a Taylr setting; use Chrome's settings to change the extension's actual browser access.
- Drag the grip to move the panel. Click it to switch between the left and right edges. With the grip focused, arrow keys move it and Home returns it to the upper-right. In short windows, the panel scrolls so every control remains reachable.
- **Close** dismisses Taylr. Escape also closes it when selection is inactive.

Installation requests access to all HTTP and HTTPS websites, so opening Taylr does not trigger a permission prompt for each site. Chrome may ask you to approve the expanded permissions when updating an older installation. If you withhold access through Chrome, Taylr respects that choice; **Chrome access settings** opens the extension's browser settings.

Rules and pause settings apply to the same exact origin (scheme, hostname and port), across its paths. Chrome internal pages and the Web Store cannot be edited. Shadow-root interiors and iframe interiors are not supported. Site redesigns can invalidate selectors; saved rules can still be restored.

Private-window rules, previews and pause settings are isolated in session storage and disappear on Chrome restart or extension reload. Regular rules and pause settings remain in local storage. Finish private customization work before explicitly reloading the extension during development. No server, account, telemetry, or remote screenshot storage is used.

## Develop

Requires Node.js 22.12+ and npm. The panel uses React, TypeScript, Tailwind CSS and Motion; the picker and rule restoration load independently of that runtime.

```sh
npm ci
npm run build
```

Open `chrome://extensions` in the approved development browser, enable **Developer mode**, choose **Load unpacked**, and select this project's `dist` directory. Rebuild and explicitly reload the extension after source changes, then refresh existing website tabs. Tests never reload an existing extension or use personal browser data.

`npm run dev` starts the local fixture server. It does not watch/reload an installed extension. The build is an unpacked Manifest V3 extension; `dist/` is generated and excluded from Git.

| Path                                                  | Responsibility                                            |
| ----------------------------------------------------- | --------------------------------------------------------- |
| `src/background.ts`, `src/background/`                | Site access, ordered rule writes, bounded preview capture |
| `src/content.ts`, `src/selector.ts`, `src/preview.ts` | Framework-free selection, restoration and local capture   |
| `src/dock.tsx`, `src/dock/`, `src/tailwind.css`       | Shadow DOM panel, movement and preview display            |
| `scripts/build.mjs`                                   | Extension bundles, manifest and icons                     |
| `tests/e2e/`, `tests/scenarios/`                      | Browser acceptance and failure scenarios                  |
| `tests/sites.json`                                    | Public-site component contracts                           |

## Verify

```sh
npx playwright install chromium
npm run check
npm run format:check
npm run test:e2e -- --workers=2
```

The test wrapper builds once before launching disposable Playwright Chromium with temporary data. It owns its fixture server and never attaches to personal Chrome sessions. Each run produces a report and evidence under `output/playwright/runs/`; find the latest root in `output/playwright/latest-run.json`. Use the wrapper rather than calling Playwright directly so preflight, build and evidence bookkeeping stay consistent.

Public websites are separate, opt-in checks:

```sh
npm run test:canary -- --workers=2
npm run test:live -- --workers=2
npm run test:compare -- --workers=1
```

Set `TAYLR_HEADED=1` for a visible disposable browser. `TAYLR_SITES`, `TAYLR_COMPONENTS`, and `TAYLR_CASES` filter investigation; `TAYLR_TRACE=full` retains successful live-case traces too. Exit **0** means the selected gate passed, **2** means external access left coverage incomplete, and **1** means a defect, missing/stale evidence, or infrastructure failure. Blocked sites never count as feature passes.

## Continuous verification

[Verify](.github/workflows/verify.yml) runs on pushes and pull requests: cached npm install, type/lint/format checks, build and local E2E with two workers. New pushes cancel superseded runs. Download reports and diagnostics from the Actions run for seven days, and a successful unpacked extension for fourteen days. The workflow's manual run can also request live canary or catalog checks. It produces an installable artifact; Chrome Web Store publishing is a separate release step.

Work on a focused branch, write failure scenarios before implementation, review the diff, and commit tested slices. Keep generated builds, reports, browser data, secrets and unrelated changes out of commits.

See [testing](docs/testing.md) for evidence and acceptance details, the [site regression matrix](docs/site-test-matrix.md) for historical/verified/blocked coverage, and [decisions](docs/decisions.md) for the architecture and privacy constraints.
