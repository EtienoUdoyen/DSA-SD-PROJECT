# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)
- **What I asked:**
- **What came back:**
- **What was wrong (or "nothing"):**

### Prompt 2:
- **What I asked:**  The organizer Creates, edits and publishes events and ticket tiers. The attendee browses, books, pays, cancels, joins waitlists and the staff Checks people in at the door
- **What came back:** merge sort was stable, moidfied about six files; the eventSearch.test.js, inventory.test.js, validation.js, inventory.js, eventSearch.js, and build-2.md, npm tests passes; 147 tests, git diff -- check is stated clean, So4 code was written in, npm tests showed a lot of green responses
tests 147, suites 34, pass 147, fail 0, cancelled 0, skipped 0, todo 0, duration_ms 16263.312
- **What was wrong (or "nothing"):** All codes passed including the REST API(memory and SQLite repository); SO2 create an event, SO3 addd ticket tiers, SO4 publish and unpublish, SO5 search, filter and sort, SO6 book tickets, SO7 pay for a booking (mock payment), cancel an unpaid booking, booking state machine, event search, filtering, sorting, HTTP app, inventory and others.

## Build 3

### Prompt 1: Build 3 prompt (docs/build-3.md)
- **What I asked:** Add the architecture diagrams, booking state machine, Node HTTP router/server, configuration, startup script, and tests. 

I gave similar commands so there was no file changes

- **What came back:** A layered architecture document, explicit booking transitions, static-file HTTP server, `/health` route, startup configuration, and `node:test` coverage.

The requested Build 3 work is already present, so no file changes were made. The architecture diagrams, booking state machine, HTTP router/server, configuration, start script, and requested tests are in architecture.md, bookingStateMachine.js, app.js, router.js, config.js, server.js, package.json, and the corresponding tests.
Ran terminal command: npm test
`npm test` passed in PowerShell: **147 tests passed, 0 failed** (34 suites). This includes the booking state-machine, router, and real `/health` HTTP tests.

- **What was wrong (or "nothing"):** The first server draft relied on an implicit response/request property for HEAD handling and had redundant error-status logic; both were simplified. Added a regression test proving static requests cannot escape `public/`.

Powershell was unavailable and my VScode test disovery has no registered test controller so test run wasn't successful at first. I had to relaunch powershell to make the test run successful.

Unable to load schema from 'https://www.schemastore.org/package': Not Found. I also had this error.

## Build 4

### Prompt 1: Build 4 prompt (docs/build-4.md)
- **What I asked:** The Build 4 prompt: an in-memory repository, event and booking services, a mock payment gateway, the API routes, `docs/api-examples.md` and API tests that start the real server.

Build a working REST API that keeps its data in memory.
- **What came back:** `src/repositories/memory.js`, `src/services/eventService.js`, `src/services/bookingService.js`, `src/lib/mockPaymentGateway.js`, `src/http/routes.js`, wiring in `src/server.js`, an error-code-to-status map in `src/http/app.js`, `docs/api-examples.md` and `test/api.test.js`.

No files changed. The requested memory repository, services, mock gateway, REST routes, API examples, and API tests already exist in memory.js, eventService.js, bookingService.js, mockPaymentGateway.js, routes.js, api-examples.md, and api.test.js.
I ran npm test. It passed: 147 tests, 0 failures, including the API tests against both memory and SQLite repositories.
- **What was wrong (or "nothing"):** In the Build 3 code, every DomainError came back as 400, so `SOLD_OUT` and `NOT_FOUND` would have had the wrong status; added one code-to-status map in `app.js`. The validation helpers lived privately inside `inventory.js`, so reusing them meant moving them to `src/domain/validation.js` rather than copying. Known gap left on purpose: two bookings at the same moment can both take the last seat (Build 5). *(My own review: add what you find when you read the code.)*

npm test. It passed: 147 tests, 0 failures, including the API tests against both memory and SQLite repositories.
- **Rules I was unsure about:** whether `venue` is required (kept optional, as in Build 2); whether a stranger paying someone else's booking should get 403 or 404 (chose 403 `FORBIDDEN`); added `unpublish`, `GET /api/events/:id` and `GET /api/bookings/:reference`, which the prompt did not list but S04 and the curl examples need.

The prompt asks for in-memory data, while the existing Build 5 setup makes npm start use SQLite. The API tests do exercise the memory repository, but the later-build startup behavior left unchanged.

## Build 5

### Prompt 1: move to SQLite and reproduce the problem (docs/build-5.md)
- **What I asked:** `src/db/schema.sql` and `src/db/connection.js` on `node:sqlite`, a SQLite repository with the same methods as `memory.js`, `scripts/seed.js`, and `scripts/oversell-demo.js` firing 50 bookings at the last seat with `Promise.all`.

Move the API to persistent SQLite storage with schema constraints, a parameterized repository, a seed script, and a 50-person last-seat demo. Then fix overselling with one atomic database update, add a regression test, and show the before-and-after results.
- **What came back:** The schema (users, events, ticket_tiers, bookings with PRIMARY KEY, FOREIGN KEY, UNIQUE and CHECK, including `CHECK (sold >= 0 AND sold <= capacity)`), `src/repositories/sqlite.js` with prepared `?` statements, the seed and oversell scripts, and `seed`/`oversell` in `package.json`.

The project had the SQLite schema, connection, repository, seed script, package commands, and oversell test. The booking service reserves seats through a conditional atomic update and returns SOLD_OUT when no row changes. The demo showed 50 successes and 59 bookings for 10 seats before the fix, and 1 success, 49 SOLD_OUT, and 10 bookings for 10 seats after.
scripts/oversell-demo.js and docs/ai-log.md was changed.
- **What was wrong (or "nothing"):** The CHECK on `sold` did **not** catch the bug: every racing request saved `sold = 9 + 1 = 10`, so the column looked right while 50 bookings existed for 1 seat (a lost update). The demo had to count rows in `bookings`, not just read `sold`. SQLite also ignores FOREIGN KEY unless `PRAGMA foreign_keys = ON` is set on every connection. There is no signup yet, so bookings would fail their FOREIGN KEY on `users`; the repository inserts a bare user row the first time an id is seen (`INSERT OR IGNORE`).

The demo used Promise.allSettled instead of the prompt’s explicit Promise.all, so I changed it to Promise.all with per-request outcome handlers. The atomic reservation and regression test were already present and passed validation.
- **Rules I was unsure about:** whether `users` should exist before Build 7 (kept it, with name, email and role empty for now).

### Prompt 2: fix it
- **What I asked:** Reserve seats with one atomic UPDATE and use the changed-row count; add `test/oversell.test.js`; show the demo before and after.
- **What came back:** `reserveSeats` and `releaseSeats` in both repositories, `bookingService.book` using `reserveSeats` instead of read-check-write, `cancel` using `releaseSeats`, and the oversell test. Demo before: 50 succeeded, 59 bookings for 10 seats. After: 1 succeeded, 49 `SOLD_OUT`, 10 bookings for 10 seats.
- **Why a lock variable or a second check does not work:** A second check reads the same stale number, because every request can read before any of them writes; checking twice only makes the gap smaller, not gone. A lock variable lives in one Node process, so a second server process (or a script writing to the same database) never sees it, and a forgotten unlock after an error blocks every later booking.
- **What was wrong (or "nothing"):** If saving the booking failed after the seat was taken, the seat stayed taken forever; added a `releaseSeats` in a `catch`. The demo used `Promise.allSettled` rather than the prompt's explicit `Promise.all`, so changed it to `Promise.all` with per-request outcome handlers. I checked that the test fails without the fix by putting the Build 4 lines back: all 4 oversell tests failed, then passed again with the fix. Known gap for Build 8: two cancel requests at the same moment could both pass the status check (refunds must release seats exactly once).

## Build 6

### Prompt 1: frontend on mock data
- **What I asked:** Build the browse and event pages, safe DOM helpers, a mock API seam, filtering, ticket selection, checkout countdown and retryable mock payment.

Build the Build 6 website using plain HTML, CSS, and browser ES modules: browse and filter events, view ticket tiers, choose a quantity, and check out with a countdown and mock payment. Keep data access behind api.js, build DOM safely with textContent, and label all form controls.
- **What came back:** The requested pages and mock API were already present. The event listing returned full event details instead of the real API's summary shape, and sort ties did not use the API's title/id tie-breaker.

The requested pages, styles, DOM helper, mock data, and mock API were already present. The site supported event search and filters, sold-out tiers, quantity limits, checkout countdown, and mock payment.
Files changed were six inluding public/index.html, public/js/api.js, public/js/mockData.js, public/js/pages/home.js, test/mockApi.test.js and docs/ai-log.md.
- **What was wrong (or "nothing"), and what I changed:** Changed `listEvents` to return API-shaped summaries, `getEvent` to return API-shaped detail, added deterministic tie-breaking and API-style validation, and aligned mock booking references/timestamps and payment transitions with the real API. Adapted home cards, changed the maximum-price input step to allow cent-accurate naira values, and added API contract/payment retry tests.

The mock event list returned full event details rather than the real API’s summary shape; mock booking metadata and some validation/payment behavior also differed from the API. I aligned those responses and behaviors, added deterministic sort tie-breaking, adjusted the maximum-price input for cent precision, and added mock API tests. All 149 tests passed, and I verified the booking and retry flows in the browser.

Rule I was unsure about: The prompt didn’t specify how long seats are held, so I used a 10-minute mock countdown.