# Shapes proxy host

A separate Node service for the Shapes browser. Floot continues to own accounts,
profiles and chat. This package has no database and copies no user data.

## Run

Use Node 22. Run `npm ci`, `npm run build`, then `npm start`.
Local address: http://localhost:3000. Production requires HTTPS for the service
worker and secure WebSocket connection. The server respects `PORT`.

## Render deployment

Put this directory at the root of a Git repository connected to Render. Create
a Blueprint using `render.yaml`, or a free Node web service with build command
`npm ci && npm run build`, start command `npm start`, and health path `/healthz`.
No database or paid service is requested. Review workspace bandwidth billing
settings separately before deployment; the free instance does not guarantee
zero usage charges when a payment method is attached.

Render free instances sleep after 15 minutes without traffic and may take about
a minute to wake. Heavy service-initiated traffic can cause suspension.

## Floot connection contract

The Floot Home launch dialog and app shortcuts open:

`https://shapes-proxy.onrender.com/#url=ENCODED_DESTINATION`

Build the fragment with `new URLSearchParams({ url: destination }).toString()`.
Open the host in a new tab from a user click. Do not embed this service worker
inside Floot or send Floot session cookies/passwords to the proxy host. The
fragment avoids putting the destination in the launch HTTP request logs.

The browser is public. Its WebSocket origin check reduces cross-site borrowing;
it is not authentication. Outbound TCP is restricted to web ports 80/443;
private/loopback IPs, direct IP targets and UDP are disabled in Wisp. The health
route checks server readiness only, not successful remote website browsing.

## Status

Deployed on Render's free instance at https://shapes-proxy.onrender.com/ on
October 3, 2026 (UTC). The source repository is public. Auto-deploy is disabled;
trigger a manual Render deployment after code changes.

The production build and four local tests passed: runtime assets/health,
WebSocket origin/path handling, URL validation, and Wisp stream limits. Live
HTTPS browsing loaded Wikipedia with images/styles and the reload control
worked. This exercises the Wisp WebSocket transport; proxied third-party
WebSocket applications and account login flows have not been verified.

Floot Home and Apps now link to the host; Floot typechecking passed. The live
Floot preview was unavailable for a click test. Some websites may reject
proxied browsers or require unsupported browser capabilities.

The build applies a guarded compatibility fix to Wisp 0.4.1's per-host stream
limiter: iterate Object.values(connection.streams), because streams is an object.
Without this fix a valid outbound connection crashes the server. The limits
remain enabled. Review this fix when upgrading Wisp.

## Runtime sources

The build installs pinned Scramjet 2.0.67-alpha.2, matching controller 0.0.14,
libcurl-transport 2.0.5 and Wisp 0.4.1. Dependencies are fetched during the build;
their upstream licenses and source apply:

- https://github.com/MercuryWorkshop/scramjet
- https://github.com/MercuryWorkshop/scramjet-controller
- https://github.com/MercuryWorkshop/libcurl-transport
- https://github.com/MercuryWorkshop/wisp-js

Keep the dependency versions in sync: the controller checks the Scramjet version
at runtime. `/sw.js` wraps the controller worker and adds its required fetch
handler; registering the controller library alone does not route page requests.
