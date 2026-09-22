# Express Compose Solution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the completed Express, Nginx, and Docker Compose solution described by the tutorial while keeping the tutorial and `main` branch available for a separate manual implementation.

**Architecture:** A Vite-built frontend is served by Nginx on host port 8080. Nginx preserves and proxies `/api/*` requests to an internal Express service at `api:3000`; focused Node tests exercise the API contract and frontend fetch helper without a third-party test framework.

**Tech Stack:** Node.js 24, npm 11, Express 5.2.1, Vite 8.2.2, Nginx Alpine, Docker 29, Docker Compose 5, Node's built-in `node:test` and Fetch APIs.

**Spec:** `docs/superpowers/specs/2026-09-10-express-compose-solution-design.md`

## Global Constraints

- Perform all implementation in sibling worktree `../learn-docker-local-llm` on branch `local-llm/express-compose-solution` created from `main`.
- Do not modify, merge, or rebase `main` during implementation.
- Do not modify `EXPRESS-COMPOSE-TUTORIAL.md`.
- Use Node `>=22.12.0`; the current project and container build use Node 24.
- Pin Express to exact version `5.2.1` and commit `api/package-lock.json`.
- Use only Node's built-in `node:test` and `node:assert/strict` for tests.
- Publish only `frontend` as host port `8080` to container port `80`; do not publish the API port in Compose.
- Use the Compose default network and service name `api`; do not add a custom network.
- Keep the API limited to `GET /api/status`; do not add persistence, authentication, retries, healthchecks, or optional tutorial extensions.
- Commit after each task with the specified message. Do not merge or rebase after the final task.
- Never claim a browser check passed unless it was performed. Report unavailable browser checks as skipped.

---

## Execution Setup: Create the Isolated Worktree

Run these commands from the existing `learn-docker` checkout before editing an implementation file.

- [ ] **Step 1: Confirm the baseline checkout is clean and on `main`**

```bash
git branch --show-current
git status --short
git log -1 --oneline
```

Expected: branch output is `main`, status prints nothing, and the latest commit contains this plan. If status is not clean, stop and report the unexpected files; do not stash, discard, or commit somebody else's changes.

- [ ] **Step 2: Confirm the target branch and path are unused**

```bash
git worktree list
git branch --list 'local-llm/express-compose-solution'
test ! -e ../learn-docker-local-llm
```

Expected: the branch command prints nothing and the path check succeeds. If either exists, report it rather than deleting or overwriting it.

- [ ] **Step 3: Create and enter the worktree**

```bash
git worktree add -b local-llm/express-compose-solution ../learn-docker-local-llm main
cd ../learn-docker-local-llm
git branch --show-current
git status --short
```

Expected: branch `local-llm/express-compose-solution` and a clean status. Keep all remaining commands inside this worktree.

- [ ] **Step 4: Read the approved inputs**

```bash
sed -n '1,260p' docs/superpowers/specs/2026-09-10-express-compose-solution-design.md
sed -n '1,560p' EXPRESS-COMPOSE-TUTORIAL.md
```

- [ ] **Step 5: Install baseline dependencies and check required tools**

```bash
npm ci
node --version
npm --version
docker version
docker compose version
git status --short
```

Expected: dependency installation succeeds, Node is at least 22.12.0, Docker can contact its daemon, Compose is available, and Git status remains clean because `node_modules/` is ignored.

---

### Task 1: Test and Implement the Frontend API Client

**Files:**

- Modify: `package.json`
- Create: `src/html/api-status.test.js`
- Create: `src/html/api-status.js`

**Interfaces:**

- Consumes: a Fetch-compatible function `(url: string) => Promise<ResponseLike>`, defaulting to `globalThis.fetch`.
- Produces: `fetchApiStatus(fetchImpl = globalThis.fetch): Promise<StatusPayload>`, where `StatusPayload` is `{ status: string, service: string, hostname: string, timestamp: string }`; requests `/api/status`, returns parsed JSON, and rejects non-2xx responses.

- [ ] **Step 1: Add the root test script**

Change only the `scripts` object in `package.json` to:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "node --test src/html/*.test.js"
}
```

- [ ] **Step 2: Write the failing helper tests**

Create `src/html/api-status.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchApiStatus } from './api-status.js';

test('fetchApiStatus requests the same-origin endpoint and returns JSON', async () => {
  const payload = {
    status: 'online',
    service: 'api',
    hostname: 'test-api',
    timestamp: '2026-09-10T00:00:00.000Z',
  };
  let requestedUrl;

  const fakeFetch = async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    };
  };

  const result = await fetchApiStatus(fakeFetch);

  assert.equal(requestedUrl, '/api/status');
  assert.deepEqual(result, payload);
});

test('fetchApiStatus rejects a non-success response', async () => {
  const fakeFetch = async () => ({ ok: false, status: 502 });

  await assert.rejects(
    fetchApiStatus(fakeFetch),
    new Error('API returned HTTP 502'),
  );
});
```

- [ ] **Step 3: Verify the test fails for the missing module**

Run `npm test`.

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/html/api-status.js`.

- [ ] **Step 4: Implement the minimal helper**

Create `src/html/api-status.js`:

```js
export async function fetchApiStatus(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl('/api/status');

  if (!response.ok) {
    throw new Error(`API returned HTTP ${response.status}`);
  }

  return response.json();
}
```

- [ ] **Step 5: Verify tests and build**

```bash
npm test
npm run build
```

Expected: two tests pass and Vite completes its production build.

- [ ] **Step 6: Commit**

```bash
git add package.json src/html/api-status.js src/html/api-status.test.js
git commit -m "feat: add tested frontend API client"
```

---

### Task 2: Test and Implement the Express Status API

**Files:**

- Create: `api/package.json`
- Create: `api/package-lock.json`
- Create: `api/src/app.js`
- Create: `api/src/server.js`
- Create: `api/test/status.test.js`

**Interfaces:**

- Consumes: `PORT`, defaulting to numeric port `3000`.
- Produces: default export `app`; `GET /api/status`; entry point bound to `0.0.0.0`.
- Response: `{ status: 'online', service: 'api', hostname: string, timestamp: string }`.

- [ ] **Step 1: Create and install the API package**

Create `api/package.json`:

```json
{
  "name": "learn-docker-api",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test"
  },
  "engines": {
    "node": ">=22.12.0"
  },
  "dependencies": {
    "express": "5.2.1"
  }
}
```

Then run:

```bash
cd api
npm install
cd ..
```

Expected: `api/package-lock.json` and ignored `api/node_modules/` are created without an install error.

- [ ] **Step 2: Write the failing HTTP contract test**

Create `api/test/status.test.js`:

```js
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import app from '../src/app.js';

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected the test server to use a TCP port');
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server) return;

  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test('GET /api/status returns live service metadata', async () => {
  const response = await fetch(`${baseUrl}/api/status`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json\b/);
  assert.equal(body.status, 'online');
  assert.equal(body.service, 'api');
  assert.equal(typeof body.hostname, 'string');
  assert.notEqual(body.hostname.length, 0);

  const parsedTimestamp = new Date(body.timestamp);
  assert.equal(Number.isNaN(parsedTimestamp.getTime()), false);
  assert.equal(parsedTimestamp.toISOString(), body.timestamp);
});
```

- [ ] **Step 3: Verify the test fails for the missing app**

Run `npm --prefix api test`.

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `api/src/app.js`.

- [ ] **Step 4: Implement the Express app**

Create `api/src/app.js`:

```js
import express from 'express';
import os from 'node:os';

const app = express();

app.get('/api/status', (_request, response) => {
  response.json({
    status: 'online',
    service: 'api',
    hostname: os.hostname(),
    timestamp: new Date().toISOString(),
  });
});

export default app;
```

- [ ] **Step 5: Implement the runtime entry point**

Create `api/src/server.js`:

```js
import app from './app.js';

const port = Number(process.env.PORT ?? 3000);

app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on port ${port}`);
});
```

- [ ] **Step 6: Verify API tests, frontend tests, and syntax**

```bash
npm --prefix api test
npm test
node --check api/src/server.js
git status --short --ignored api/node_modules dist src/html/password.txt
```

Expected: all tests and syntax checks pass. `api/node_modules/`, `dist/`, and `src/html/password.txt` appear only with ignored (`!!`) status.

- [ ] **Step 7: Commit**

```bash
git add api/package.json api/package-lock.json api/src/app.js api/src/server.js api/test/status.test.js
git commit -m "feat: add tested Express status API"
```

---

### Task 3: Containerize and Smoke-Test the API

**Files:**

- Create: `api/.dockerignore`
- Create: `api/Dockerfile`

**Interfaces:**

- Consumes: the API package and source from Task 2.
- Produces: an OCI image that listens on container port `3000`, honors `PORT`, and starts with `npm start`.

- [ ] **Step 1: Verify the image cannot yet be built**

```bash
docker build -t learn-docker-api:local-llm ./api
```

Expected: FAIL because `api/Dockerfile` does not exist. If it succeeds, stop and inspect unexpected files.

- [ ] **Step 2: Define build-context exclusions**

Create `api/.dockerignore`:

```text
node_modules
npm-debug.log*
```

- [ ] **Step 3: Create the production API image**

Create `api/Dockerfile`:

```dockerfile
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY src/ ./src/

ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
```

- [ ] **Step 4: Build the image**

```bash
docker build -t learn-docker-api:local-llm ./api
```

Expected: successful build from the API-specific context.

- [ ] **Step 5: Start the container and wait for readiness**

Use host port 3100 so the tutorial's API port 3000 remains free:

```bash
docker run --rm -d --name learn-docker-api-local-llm -p 3100:3000 learn-docker-api:local-llm
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://localhost:3100/api/status >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 10 ]; then
    docker logs learn-docker-api-local-llm
    exit 1
  fi
  sleep 1
done
```

Expected: readiness succeeds within ten attempts.

- [ ] **Step 6: Verify response and hostname**

```bash
curl -i http://localhost:3100/api/status
EXPECTED_API_HOST=$(docker exec learn-docker-api-local-llm hostname)
ACTUAL_API_HOST=$(curl -fsS http://localhost:3100/api/status | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).hostname")
test "$EXPECTED_API_HOST" = "$ACTUAL_API_HOST"
```

Expected: HTTP 200 JSON and a successful hostname equality check.

- [ ] **Step 7: Stop the standalone container**

```bash
docker stop learn-docker-api-local-llm
```

Expected: it is automatically removed because it was started with `--rm`.

- [ ] **Step 8: Commit**

```bash
git add api/.dockerignore api/Dockerfile
git commit -m "build: containerize the status API"
```

---

### Task 4: Add and Validate the Nginx Reverse Proxy

**Files:**

- Modify: `Dockerfile`
- Create: `nginx/default.conf`

**Interfaces:**

- Consumes: frontend output at `/app/dist` and Compose endpoint `api:3000`.
- Produces: `/api/* -> http://api:3000` without URI rewriting; all other paths use the static-site fallback.

- [ ] **Step 1: Make the image require the proxy configuration**

Replace the root `Dockerfile` with:

```dockerfile
FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY vite.config.js ./
COPY src/ ./src/

RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 2: Verify the required config is missing**

Run `docker build -t learn-docker-frontend:local-llm .`.

Expected: FAIL because `nginx/default.conf` does not exist, proving the image requires the intended configuration.

- [ ] **Step 3: Create the proxy configuration**

Create `nginx/default.conf`:

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://api:3000;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

The `proxy_pass` value must not end with `/`; omitting the URI component preserves `/api/status` upstream.

- [ ] **Step 4: Build and test the frontend image**

```bash
npm test
npm run build
docker build -t learn-docker-frontend:local-llm .
docker run --rm --add-host api:127.0.0.1 learn-docker-frontend:local-llm nginx -t
```

Expected: tests and build pass; Nginx prints `syntax is ok` and `test is successful`. The temporary host mapping allows Nginx to resolve its static upstream during the standalone syntax check.

- [ ] **Step 5: Inspect the image boundary**

```bash
docker run --rm learn-docker-frontend:local-llm cat /etc/nginx/conf.d/default.conf
docker run --rm learn-docker-frontend:local-llm sh -c 'command -v node && exit 1 || echo "Node is absent from frontend"'
```

Expected: the server configuration is printed and Node is reported absent.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile nginx/default.conf
git commit -m "feat: proxy API requests through Nginx"
```

---

### Task 5: Define and Verify the Compose Application

**Files:**

- Create: `compose.yaml`

**Interfaces:**

- Consumes: the frontend and API Dockerfiles.
- Produces: services `frontend` and `api`; host endpoint `http://localhost:8080`; internal endpoint `http://api:3000`.

- [ ] **Step 1: Verify configuration is absent**

Run `docker compose config`.

Expected: FAIL because no Compose file exists. If Compose discovers an unexpected file, stop and inspect it.

- [ ] **Step 2: Create the two-service model**

Create `compose.yaml`:

```yaml
services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:80"
    depends_on:
      - api

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
```

- [ ] **Step 3: Validate resolved configuration**

```bash
docker compose -p learn-docker-local-llm config
```

Expected: two services, only `frontend` with a published port, and no custom network.

- [ ] **Step 4: Build and start both services**

```bash
if lsof -nP -iTCP:8080 -sTCP:LISTEN; then
  echo 'Port 8080 is already in use; stop and report the conflict.'
  exit 1
fi
docker compose -p learn-docker-local-llm up --build -d
docker compose -p learn-docker-local-llm ps
```

Expected: both services run; only the frontend shows `8080->80/tcp`. Do not terminate an unrelated process if port 8080 is occupied.

- [ ] **Step 5: Wait for the proxy endpoint**

```bash
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://localhost:8080/api/status >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 10 ]; then
    docker compose -p learn-docker-local-llm logs
    exit 1
  fi
  sleep 1
done
```

Expected: success within ten attempts.

- [ ] **Step 6: Verify healthy network boundaries**

```bash
curl -I http://localhost:8080
curl -i http://localhost:8080/api/status
docker compose -p learn-docker-local-llm exec frontend wget -qO- http://api:3000/api/status
```

Expected: frontend HTTP 200; both API requests return the defined JSON contract.

- [ ] **Step 7: Prove the API is not published**

```bash
if docker compose -p learn-docker-local-llm port api 3000; then
  echo 'The API unexpectedly has a published port.'
  exit 1
else
  echo 'The API has no published host port.'
fi
curl --max-time 2 http://localhost:3000/api/status
```

Expected: Compose reports no API binding and the curl fails. If an unrelated process answers on port 3000, record that environmental conflict; the Compose port check remains authoritative.

- [ ] **Step 8: Stop and commit**

```bash
docker compose -p learn-docker-local-llm down
git add compose.yaml
git commit -m "build: orchestrate frontend and API with Compose"
```

---

### Task 6: Connect the Terminal Status Command to the API

**Files:**

- Modify: `src/html/index.html:1047`
- Modify: `src/html/index.html:1588`

**Interfaces:**

- Consumes: `fetchApiStatus(): Promise<{ status: string, hostname: string }>`.
- Produces: asynchronous `processCommand(cmd)` behavior with healthy and unreachable status output.

- [ ] **Step 1: Confirm integration is absent**

```bash
rg -n "fetchApiStatus|checking services|api: unreachable" src/html/index.html
```

Expected: no matches and exit status 1.

- [ ] **Step 2: Import the tested helper**

At the top of the existing `<script type="module">`, keep the two current imports and add the third:

```js
import '@fontsource/press-start-2p/latin-400.css';
import * as THREE from 'three';
import { fetchApiStatus } from './api-status.js';
```

- [ ] **Step 3: Make command processing asynchronous**

Change:

```js
function processCommand(cmd) {
```

to:

```js
async function processCommand(cmd) {
```

- [ ] **Step 4: Replace the existing `status` case**

Use this complete case block:

```js
case 'status': {
  showOutput('checking services...');

  try {
    const api = await fetchApiStatus();
    showOutput(
      `frontend: online | api: ${api.status} | host: ${api.hostname} | ` +
      `matrix: ${matrixEnabled ? 'on' : 'off'} | ` +
      `shapes: ${shapesEnabled ? 'on' : 'off'}`,
      5000,
    );
  } catch (error) {
    console.error('Status request failed:', error);
    showOutput(
      `frontend: online | api: unreachable | ` +
      `matrix: ${matrixEnabled ? 'on' : 'off'} | ` +
      `shapes: ${shapesEnabled ? 'on' : 'off'}`,
      5000,
    );
  }

  break;
}
```

Do not change any other command case or terminal presentation.

- [ ] **Step 5: Run tests and build**

```bash
npm test
npm --prefix api test
npm run build
```

Expected: all three tests pass and Vite resolves `./api-status.js`.

- [ ] **Step 6: Start the integrated application**

```bash
docker compose -p learn-docker-local-llm up --build -d
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://localhost:8080/api/status >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 10 ]; then
    docker compose -p learn-docker-local-llm logs
    exit 1
  fi
  sleep 1
done
```

Expected: both services start and the proxy endpoint becomes ready.

- [ ] **Step 7: Perform the healthy browser check if possible**

Open `http://localhost:8080`, skip or finish the intro, type `status`, and verify:

```text
frontend: online | api: online | host: <container hostname> | matrix: <on-or-off> | shapes: <on-or-off>
```

Compare the displayed host with `docker compose -p learn-docker-local-llm exec api hostname`. If no browser is available, record `SKIPPED: browser access unavailable`; do not mark the check passed.

- [ ] **Step 8: Commit**

```bash
git add src/html/index.html
git commit -m "feat: connect terminal status to the API"
```

Expected: this commit modifies only `src/html/index.html`.

---

### Task 7: Demonstrate Failure, Recovery, and Final Integrity

**Files:**

- Verify only; no repository file should change.

**Interfaces:**

- Consumes: the complete Compose application.
- Produces: a clean branch and evidence-based handoff report.

- [ ] **Step 1: Stop only the API**

```bash
docker compose -p learn-docker-local-llm stop api
docker compose -p learn-docker-local-llm ps
```

Expected: `frontend` remains running and `api` is stopped.

- [ ] **Step 2: Verify static serving survives and proxying fails**

```bash
curl -I http://localhost:8080
curl -i http://localhost:8080/api/status
docker compose -p learn-docker-local-llm logs frontend
```

Expected: static HTTP 200; the API request returns an Nginx upstream error, normally 502; logs contain failed-upstream evidence.

- [ ] **Step 3: Check browser fallback if possible**

With the frontend still open, type `status` and verify:

```text
frontend: online | api: unreachable | matrix: <on-or-off> | shapes: <on-or-off>
```

Also verify `matrix on`, `matrix off`, `shapes on`, and `shapes off` still respond. Without browser access, record `SKIPPED: browser access unavailable`.

- [ ] **Step 4: Restart only the API and verify recovery**

```bash
docker compose -p learn-docker-local-llm start api
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://localhost:8080/api/status >/dev/null; then
    break
  fi
  if [ "$attempt" -eq 10 ]; then
    docker compose -p learn-docker-local-llm logs
    exit 1
  fi
  sleep 1
done
docker compose -p learn-docker-local-llm ps
```

Expected: recovery without rebuilding or restarting `frontend`.

- [ ] **Step 5: Inspect runtime boundaries**

```bash
docker compose -p learn-docker-local-llm images
docker compose -p learn-docker-local-llm exec frontend sh -c 'command -v node && exit 1 || echo "Node is absent from frontend"'
docker compose -p learn-docker-local-llm exec api sh -c 'command -v node && node --version'
docker compose -p learn-docker-local-llm exec frontend ls -lah /usr/share/nginx/html
docker compose -p learn-docker-local-llm exec api sh -c 'ls -lah /app && ls -lah /app/src'
```

Expected: Node absent from frontend and present in API; frontend assets and API source exist only in their intended runtime locations.

- [ ] **Step 6: Re-run acceptance checks**

```bash
npm test
npm --prefix api test
npm run build
docker compose -p learn-docker-local-llm config --quiet
curl -fsS http://localhost:8080 >/dev/null
curl -fsS http://localhost:8080/api/status
docker compose -p learn-docker-local-llm exec frontend wget -qO- http://api:3000/api/status
```

Expected: three tests pass, Vite builds, Compose validates, and all HTTP checks succeed.

- [ ] **Step 7: Prove isolation and cleanliness**

```bash
git diff --exit-code main -- EXPRESS-COMPOSE-TUTORIAL.md
git status --short
git log --oneline --decorate main..HEAD
```

Expected: no tutorial diff, clean status, and exactly six implementation commits on the feature branch.

- [ ] **Step 8: Tear down only this Compose project**

```bash
docker compose -p learn-docker-local-llm down
docker compose -p learn-docker-local-llm ps
```

Expected: this project's containers and network are removed; its built images remain for review.

- [ ] **Step 9: Produce the handoff and stop**

First capture the exact implementation commits:

```bash
git log --reverse --format='%h %s' main..HEAD
```

Write a final report headed `Local LLM implementation handoff`. Include the absolute worktree path, branch name, confirmation that the tutorial and `main` implementation files were not changed, and the complete command output above.

Under `Verification`, report PASS or FAIL with observed evidence for the root tests, API tests, Vite build, Compose validation, healthy proxy path, unpublished API port, API stop/start recovery, and runtime image inspection. Report each browser check as PASS, FAIL, or SKIPPED with its actual reason. Under `Caveats or deviations`, write `None` when there are none; otherwise list every concrete deviation and its reason.

Do not commit the handoff, merge, rebase, remove the worktree, or delete images. Stop after reporting so the branch can be reviewed.
