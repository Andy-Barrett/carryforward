# Working on CarryForward

Keep the technician’s job at the center of the change. A useful improvement makes the briefing clearer, field capture easier, or the returned report more reliable.

Use Node.js 24 and install the lockfile with `npm ci --ignore-scripts`. The live transport uses `ws` under the MIT license; no native package is required. Run `npm test` and check the affected workflow in the browser. For interface changes, check phone and desktop widths. Camera, recording, installation, and offline changes also need testing on real devices.

Use fictional records in fixtures, screenshots, and issue reports. Do not commit credentials, customer information, recordings, or service photos. Keep integrations independent of any one work-order system.

A pull request should explain what the technician can do differently, how the change was checked, and what remains incomplete. Preserve the distinction between a technician’s statement, supporting evidence, and an accepted Operations outcome.

Keep the README and build plan accurate. If a feature uses a stub or deterministic fixture, say so. Model behavior needs an evaluation case that could reveal a real failure; tests should not merely repeat the implementation.
