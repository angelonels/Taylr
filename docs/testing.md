# Browser acceptance contract

Written before implementation. E2E is the test mechanism; no mirrored unit tests.

Failure cases to exercise:

- A click follows a link or activates a page handler instead of hiding its target.
- Hiding one of two similar elements hides both, or a broad selector hides the page.
- Reload, another tab, or dynamically inserted content loses the saved rule.
- Undo removes the wrong rule; Restore changes the site's original inline styling.
- Escape leaks picker listeners or a second activation duplicates the interface.
- A storage failure reports success, or concurrent tabs overwrite each other's rules.
- A restricted browser URL fails without a recovery message.
- Page styles corrupt extension controls; zoom or reduced motion breaks access.

Repeatable artifacts: Playwright HTML report, traces, and screenshots in output/playwright. Tests connect only to the already running, explicitly approved Chrome profile via TAYLR_CDP_URL. They never launch a browser or inspect another profile. A local fixture gives deterministic failures; the opt-in site matrix checks real public sites. Do not put profile data or authenticated screenshots in Git.

## One browser connection across runs

`npm run browser:session` holds one approved CDP connection. Keep it running while iterating. The Playwright runner sends allowlisted scenario IDs to that process over an authenticated loopback endpoint, rather than reconnecting to Chrome for each run. The connection token is kept in `.local/browser-session.json`, ignored by Git with owner-only file permissions. The endpoint does not accept arbitrary JavaScript or URLs. It serializes runs and rejects browser-origin requests.

If Chrome disconnects, the broker reports that condition and never reconnects automatically. Restart it explicitly when needed. The user has authorized the agent to press Allow on the remote-debugging prompt in the approved profile; never ask the user repeatedly. No browser protections are disabled.

All test interactions and explicit trace captures take place in newly created Incognito contexts. The runner never launches a browser or another profile. Private rules use a separate, memory-only session namespace. Each scenario refuses a nonempty private site profile and only cleans up after claiming a clean profile. Do not edit the same test origin in another private tab during a run. Set `TAYLR_RELOAD_BUILD=1` only when explicitly reloading a changed unpacked build at broker startup. This opens a short-lived Chrome extensions setup page outside the captured trace. Test runs never reload the extension. Extension reload clears private rules, so finish private customization work before an explicit build reload.

```sh
# Terminal 1: start the fixture server.
npm run dev

# Terminal 2: connect once; keep this running.
TAYLR_CDP_URL='ws://127.0.0.1:9222/devtools/browser/…' \
TAYLR_EXTENSION_ID='your-extension-id' npm run browser:session

# Terminal 3: repeat without opening a new CDP connection.
npm run test:e2e
TAYLR_SITES=wikipedia npm run test:live
# All 20 candidate sites, after reviewing permissions and baseline contracts:
npm run test:live
```

Load the extension in the approved profile, enable Allow in Incognito, and grant each selected test origin before its live run. The live runner checks permission first and fails with a recovery message instead of opening repeated permission prompts. The fixture uses `http://127.0.0.1:5173`. Never grant access to account pages merely to make a test pass.

The default suite runs the deterministic fixture and reports the 20 live candidates as intentionally skipped. `test:live` opts into the public-site matrix; `TAYLR_SITES` narrows it by ID. The fixture also checks keyboard Hide / Undo, reflow at 320, 375, 768, 1024, 1440 and 2560 CSS pixels, and captures the side panel in light and dark appearances.

See [the site matrix](site-test-matrix.md) for the six shared scenarios, why each candidate matters, and the honest coverage status.

## Regression coverage added during review

The fixture exercises concurrent worker writes and exact rule IDs, private storage without changing the regular-origin record, Undo ownership when another tab adds a rule, and real tab activation from a website to a protected browser page while Restore is pending. A delayed reply is injected at the panel's browser API boundary. Denied permission is injected at that boundary too, avoiding an unwanted real permission prompt. These are browser integration scenarios, not unit tests.

The viewport checks establish absence of horizontal overflow; appearance screenshots support manual inspection. They do not establish WCAG conformance or 200% zoom coverage. Storage quota failure remains a documented follow-up acceptance case.

Live scenarios explicitly activate the target page before keyboard input. A multi-tab check must not infer focus after opening a revisit or panel tab; YouTube’s initial Exit failure exposed this test-driver requirement. The corrected scenario passed without weakening the Escape assertion.
