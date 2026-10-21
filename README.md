# Taylr

The internet wasn't made for you—until now. Taylr any website in seconds: point, click, and permanently reshape how the web looks and behaves.

## Develop

Requires Node.js 22.12+ (or 20.19+) and npm.

```sh
npm ci
npm run build
```

In the Chrome profile **angelonelson.dev@gmail.com**, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this project's `dist` directory. Rebuild and reload the extension after source changes.

Open a website, click the Taylr toolbar icon to open the side panel, and choose **Hide**. Allow access to that site when Chrome asks. Point at the element and click. Use ↑ to select its parent, ↓ for its first child, Enter to hide, Escape or Done to exit, and Undo to reverse changes from the current session. Tab can select page controls for keyboard hiding. **Restore** in the side panel reveals everything hidden on that site.

Rules apply across pages of the same exact origin and remain on this device. Browser internal pages and the Chrome Web Store cannot be edited. Closed shadow roots and iframe interiors are not supported yet. Site redesigns can invalidate selectors; Restore is always available.

## Verify

```sh
npm run check
# Keep one approved browser connection alive across runs:
TAYLR_CDP_URL='ws://127.0.0.1:9222/devtools/browser/…' \
TAYLR_EXTENSION_ID='your-extension-id' npm run browser:session
# In another terminal:
npm run test:e2e
TAYLR_SITES=wikipedia npm run test:live
```

The persistent browser session attaches to your already running approved Chrome instance and creates an Incognito test context. Enable **Allow in Incognito** for Taylr first. It never creates a browser profile. Enable remote debugging in `chrome://inspect/#remote-debugging` and approve the connection. Load the extension and allow the local fixture origin before testing. Evidence is written under `output/playwright/` and is excluded from Git. See [the browser acceptance contract](docs/testing.md) for failure scenarios and [foundation decisions](docs/decisions.md) for scope and tradeoffs.

The [20-site regression matrix](docs/site-test-matrix.md) defines shared acceptance scenarios and future site-specific probes. Planned candidates are not compatibility claims.

Private-window rules are separate from regular rules and temporary: Chrome restart or extension reload clears them. Normal-window rules remain saved locally.
