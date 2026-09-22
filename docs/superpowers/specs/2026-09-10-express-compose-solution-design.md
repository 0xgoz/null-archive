# Express Compose Solution Design

## Purpose

Create a completed, testable implementation of `EXPRESS-COMPOSE-TUTORIAL.md` for evaluation by a local coding agent while preserving the untouched tutorial and the `main` branch for a later manual implementation.

The agent-built solution will live in a separate Git worktree at `../learn-docker-local-llm` on branch `local-llm/express-compose-solution`. The agent must not merge, rebase, or modify `main`.

## Scope

The implementation will add:

- an Express API with a live status endpoint;
- a production API container image;
- an Nginx reverse proxy from the frontend to the API;
- a two-service Docker Compose application;
- frontend integration for the terminal's `status` command;
- focused automated tests for the API and frontend status helper;
- documented automated, container-level, and manual verification.

The implementation will not add a database, persistence, authentication, a custom Docker network, a frontend framework, healthcheck orchestration, development-only Compose configuration, API scaling, or other optional tutorial extensions.

`EXPRESS-COMPOSE-TUTORIAL.md` must remain unchanged so it can continue to serve as the manual exercise.

## Git Isolation and Handoff

The implementation starts from the clean `main` baseline commit and uses a sibling worktree:

```text
Main checkout:       learn-docker/                 branch main
Agent checkout:      learn-docker-local-llm/       branch local-llm/express-compose-solution
```

Implementation work is committed in independently testable stages. The agent stops after verification and does not merge or rebase. Its final report must include:

- the absolute worktree path and branch name;
- the commits created, in order;
- every verification command run and whether it passed;
- any skipped check and the reason it was skipped;
- any known caveat or deviation from this specification.

The completed branch will be reviewed separately before any integration decision.

## Runtime Architecture

```text
Browser
  |
  | http://localhost:8080 and same-origin /api/status
  v
frontend container
  Nginx :80
  |-- serves /usr/share/nginx/html
  `-- proxies /api/* without rewriting the URI
          |
          | http://api:3000 over the Compose default network
          v
      api container
        Express :3000 on 0.0.0.0
```

Only the frontend container publishes a host port. The API is discoverable as `api` on the Compose default network but is not published to the host.

## File Responsibilities

### Existing files to modify

- `Dockerfile` keeps the Node/Vite build stage and Nginx runtime stage, and copies `nginx/default.conf` into the runtime image.
- `package.json` adds the root test command needed to run the frontend helper test without adding a test framework.
- `src/html/index.html` imports `fetchApiStatus`, makes command processing asynchronous, and updates the `status` command's success and failure output.

### Files to create

- `api/package.json` defines the private ES-module API package, its `start` and `test` scripts, the Express runtime dependency, and the supported Node version.
- `api/package-lock.json` locks the API dependency graph.
- `api/src/app.js` creates and exports the Express app without opening a listening socket.
- `api/src/server.js` reads `PORT`, defaults it to `3000`, and starts the app on `0.0.0.0`.
- `api/test/status.test.js` starts the app on an ephemeral loopback port and verifies the status endpoint through a real HTTP request.
- `api/Dockerfile` installs locked production dependencies, copies API source, documents port 3000, and starts the package's `start` script.
- `api/.dockerignore` excludes local dependencies and npm debug logs from the API build context.
- `nginx/default.conf` serves the Vite output, proxies `/api/` to `http://api:3000` without changing the request URI, and retains the existing single-page fallback.
- `compose.yaml` builds the frontend from the repository root, builds the API from `api/`, publishes `8080:80` for the frontend, and gives the frontend a startup-order dependency on the API.
- `src/html/api-status.js` exports the browser-friendly `fetchApiStatus` helper.
- `src/html/api-status.test.js` verifies successful parsing and explicit rejection of non-success HTTP responses with Node's built-in test runner.

The API is split into application construction and process startup so route behavior can be tested without spawning an unmanaged child process or adding a third-party HTTP test library. The frontend request helper is separated from the large HTML file so its networking behavior can be unit tested with a supplied `fetch` implementation.

## API Contract

`GET /api/status` returns HTTP 200 with a JSON content type and this shape:

```json
{
  "status": "online",
  "service": "api",
  "hostname": "<current machine or container hostname>",
  "timestamp": "<current ISO-8601 timestamp>"
}
```

`status` and `service` are exact string constants. `hostname` comes from `node:os` and must be a non-empty string. `timestamp` comes from `new Date().toISOString()` and must parse as a valid date. Repeated requests generate new response objects at request time.

The API listens on `Number(process.env.PORT ?? 3000)` and binds to `0.0.0.0` when run through `api/src/server.js`.

## Frontend Behavior

`fetchApiStatus` accepts an optional fetch-compatible function for testability and defaults to `globalThis.fetch`. It requests the relative same-origin path `/api/status`. It must inspect `response.ok`; a non-success response throws `Error("API returned HTTP <status>")`. A successful response returns the parsed JSON body.

The existing command processor becomes asynchronous. When the user enters `status`, it:

1. immediately displays `checking services...`;
2. awaits `fetchApiStatus()`;
3. on success, displays `frontend: online`, the API's `status` and `hostname`, and the existing Matrix and shape settings for five seconds;
4. on failure, writes the detailed error to `console.error`, displays `frontend: online | api: unreachable` plus the Matrix and shape settings for five seconds, and does not disrupt other terminal commands.

The Enter-key handler may call the asynchronous processor without blocking further browser event handling. Rejections are handled inside the `status` case so they do not become unhandled promise rejections.

## Container and Proxy Configuration

The API image uses `node:24-alpine`, `/app` as its working directory, `npm ci --omit=dev` for its locked runtime installation, `PORT=3000`, `EXPOSE 3000`, and `npm start` as its command.

The frontend image retains the existing Node 24 Alpine Vite build stage and Nginx Alpine runtime stage. The runtime stage copies `nginx/default.conf` to `/etc/nginx/conf.d/default.conf`.

Nginx listens on port 80. Requests under `/api/` use `proxy_pass http://api:3000` with no URI component so `/api/status` remains `/api/status` upstream. Other requests use `try_files $uri $uri/ /index.html`.

`compose.yaml` defines exactly two services:

- `frontend` builds from the repository root, publishes host port 8080 to container port 80, and declares `depends_on: [api]` for startup order;
- `api` builds from the `api/` directory and declares no host port.

Compose's default network and service-name DNS provide connectivity. Short-form `depends_on` does not claim application readiness; a brief proxy failure during API startup remains acceptable for this exercise.

## Error Handling

The frontend distinguishes an available frontend from an unavailable API. Network errors, invalid upstream responses, and Nginx proxy errors all result in the user-visible `api: unreachable` status while preserving the rest of the terminal UI. The original error is logged for diagnosis.

The helper explicitly handles non-2xx responses because Fetch does not reject those responses automatically. No retry loop is added.

Container failures are diagnosed at the smallest relevant boundary before code is changed:

1. host to Nginx;
2. Nginx to `api:3000` through Compose DNS;
3. Express listening interface and port;
4. forwarded path to Express route.

## Testing and Verification

### Automated tests

The project uses Node's built-in `node:test` and `node:assert/strict`; no third-party test framework is added.

The API test starts the exported Express app on an ephemeral port bound to `127.0.0.1`, requests `/api/status` with Node's built-in Fetch implementation, and closes the server after the test. It verifies:

- HTTP status 200;
- a JSON content type;
- exact `status` and `service` values;
- a non-empty hostname string;
- a timestamp that matches its ISO serialization after parsing.

Frontend helper tests inject a fake fetch function and verify:

- the requested URL is exactly `/api/status`;
- successful JSON is returned unchanged;
- a response with `ok: false` and status 502 rejects with `API returned HTTP 502`.

The root production build must also pass.

### Container verification

The agent runs and reports checks that demonstrate:

- `docker compose config` accepts the configuration;
- both images build and both services reach a running state;
- `http://localhost:8080` serves the frontend;
- `http://localhost:8080/api/status` traverses Nginx and reaches Express;
- the frontend container can resolve and request `http://api:3000/api/status`;
- `http://localhost:3000/api/status` is unavailable because the API has no published host port;
- stopping the API leaves the static frontend available and makes the proxied API request fail;
- starting the API restores the endpoint without restarting the frontend;
- Node is absent from the frontend runtime image;
- the frontend contains generated assets, while the API contains its source and runtime dependency installation.

Compose resources are removed with `docker compose down` after verification.

### Manual browser verification

When browser access is available, the agent opens `http://localhost:8080`, runs the terminal `status` command with the API running and stopped, and confirms the expected success and fallback text. If browser access is unavailable, the agent must identify these as skipped manual checks rather than implying they passed.

## Acceptance Criteria

The work is complete when:

- all automated tests and the root production build pass;
- the two-service Compose application validates, builds, and starts;
- the API contract is reachable only through the frontend's published port from the host;
- the terminal status workflow handles both healthy and unavailable API states;
- failure and recovery are demonstrated without restarting the frontend;
- `EXPRESS-COMPOSE-TUTORIAL.md` and `main` remain unchanged by implementation work;
- implementation commits exist only on `local-llm/express-compose-solution`;
- the agent provides an evidence-based final handoff suitable for a later branch review.
