# Taylr

Edit or hide page elements, turn on dark mode per site, and restore everything later. Rules and cropped previews stay on your device.

## Use

Click Taylr’s Chrome toolbar icon to open the floating panel.

- **Edit:** click an element to lock the selection, then preview changes to text, colors, typography and borders. Sliders and steppers handle values and units; **Advanced** holds size, aspect ratio, padding, margins and gaps on existing rows/grids. Save keeps changes; Cancel or Escape discards the draft. Escape closes an open menu first; Done leaves a clean editor. Reset returns a field to its value when selected. Parent/Child refines the locked selection; Hide uses that same element.
- **Hide:** click a page element, or use ↑/↓ to select its parent/child and Enter to hide. Escape, Cancel or Done ends selection.
- **Undo:** reverse this session’s changes while preserving newer saves from other tabs.
- **Dark mode:** recolor the site’s text and controls with a locally bundled engine; toggle it off to restore the site’s colors. The setting follows the exact origin across tabs and later visits, and yields to OS forced colors without forgetting your choice.
- **Edits:** inspect local previews and restore one element or all changes for this site.
- **Site:** pause/resume all saved changes and dark mode without deleting them, or open Chrome’s access settings.
- **Move:** drag the grip, click it to switch edges, or focus it and use arrow keys. Home resets placement. Fold compacts the panel; Close dismisses it.

Rules apply to an exact origin (scheme, hostname and port). Installation requests HTTP/HTTPS access; Chrome controls the actual grant. Internal pages, the Web Store, iframe interiors and shadow-root interiors are unsupported for Edit and Hide. Dark mode can style open shadow roots; iframe interiors, closed shadow roots, canvas/WebGL and media pixels keep their native rendering, and background photos may stay bright. Website changes can invalidate saved selectors.

Text editing supports leaf text without replacing nested controls. Form fields and existing page editors are excluded. CSS controls change declarations, not website source files; layout can limit their visible effect. Text updates yield if a site repeatedly overwrites them.

Regular rules, dark mode and pause settings use local storage. Incognito rules, previews, dark mode and pause settings use isolated session storage and clear on browser restart or extension reload. Panel position, disclosures and color-picker preferences are transient. No account, server or telemetry is involved. When a page’s CSS cannot be read directly, dark mode fetches public stylesheets through the extension without credentials or redirects, within time and size limits; images are never sent for analysis. Another active Dark Reader instance stays in control.

## Develop

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm run build
```

In the approved development browser, open `chrome://extensions`, enable Developer mode and load this project’s `dist` directory. After rebuilding, explicitly reload the extension. Finish private customization first: extension reload clears private rules. Existing page documents may need refreshing to load new injected code; save their work first. If Hide works but dark mode reports a connection error after a rebuild, the old background worker is still loaded: reload Taylr in Chrome’s extension settings, then refresh the page.

The React/TypeScript/Tailwind panel loads on demand, inside Shadow DOM. The picker and rule restoration remain independent of React. `npm run dev` serves fixtures; it does not reload installed extensions. Generated builds, browser data and evidence stay outside Git.

## Verify

```sh
npx playwright install chromium
npm run verify  # types, lint, formatting and browser acceptance
```

Tests build once and launch disposable Chromium with temporary data. Reports and traces live under `output/playwright/runs/`; `output/playwright/latest-run.json` locates the latest run. CI runs the local gate on pull requests and pushes to `main` and retains test/build artifacts.

Opt-in public-site checks: `npm run test:canary`, `npm run test:live`, `npm run test:compare`, and `npm run test:dark` for the dark-mode lifecycle on every catalog site. See [testing](docs/testing.md) for filters and outcome semantics, [the matrix](docs/site-test-matrix.md) for coverage, and [decisions](docs/decisions.md) for architecture and constraints.

Dark mode embeds MIT-licensed Dark Reader 4.9.133. See [third-party notices](THIRD_PARTY_NOTICES.md) and the [dark-mode decision](docs/research/dark-mode.md) for the engine boundary, guarded build adaptations and known limits.
