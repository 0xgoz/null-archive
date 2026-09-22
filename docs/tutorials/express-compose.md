# Connect a frontend and Express API with Docker Compose

Your task is to extend the existing static site into a two-service application:

```text
Browser -> Nginx frontend -> Express API
             /api/status      api:3000
```

You will write the application and container configuration yourself. Replace every
`____` before running an exercise. The guide provides hints and checks, but it does
not contain a completed solution.

## What you will learn

By the end, you should be able to explain:

- why the browser talks to Nginx rather than directly to the API container;
- how Compose gives services DNS names on its default network;
- the difference between a host port and a container port;
- how Nginx forwards an HTTP request to another container;
- why `depends_on` controls startup order but does not prove readiness;
- how to diagnose a failure at the browser, proxy, network, or API layer.

The finished project will have this structure:

```text
learn-docker/
├── api/
│   ├── src/
│   │   └── server.js
│   ├── package.json
│   ├── package-lock.json
│   ├── Dockerfile
│   └── .dockerignore
├── nginx/
│   └── default.conf
├── src/html/index.html
├── docs/tutorials/
│   ├── multi-stage-docker.md
│   └── express-compose.md
├── Dockerfile
└── compose.yaml
```

## 1. Build the API locally

Create the API package from the repository root:

```sh
mkdir -p api/src
cd api
npm init -y
npm install express
```

Edit `api/package.json`:

- mark the package as private;
- use ES modules;
- add a `start` script that runs `src/server.js`;
- keep `express` under `dependencies`, not `devDependencies`.

Use the existing root `package.json` as a reference for the first two settings.
The API needs separate package files because it is a separate application with a
separate dependency lifecycle.

Create `api/src/server.js` from this scaffold:

```js
import express from 'express';
import os from 'node:os';

const app = express();
const port = Number(process.env.PORT ?? ____);

app.get('____', (_request, response) => {
  response.json({
    status: '____',
    service: '____',
    hostname: os.____(),
    timestamp: new Date().____(),
  });
});

app.listen(port, '____', () => {
  console.log(`API listening on port ${port}`);
});
```

Hints:

- The agreed route is `/api/status`.
- The default port is `3000`, but reading `PORT` makes the process configurable.
- `os.hostname()` exposes the hostname assigned to the current machine or container.
- An ISO timestamp is useful because it proves each response was generated live.
- Listen on all interfaces, not only the loopback interface. The conventional IPv4
  address for all interfaces is `0.0.0.0`.
- Keep this as a single-route application. Routers, controllers, validation
  libraries, and a database are deliberately outside this exercise.

The official Express [hello-world example](https://expressjs.com/en/starter/hello-world/)
shows the minimum pieces needed to create a server and route.

Run and inspect it:

```sh
npm start
```

In another terminal:

```sh
curl -i http://localhost:3000/api/status
```

Checkpoint:

- The response status is `200`.
- `Content-Type` describes JSON.
- The body contains `status`, `service`, `hostname`, and `timestamp`.
- Repeating the request produces a new timestamp.

Stop the API with Ctrl+C and return to the repository root:

```sh
cd ..
```

## 2. Containerize the API

Create `api/.dockerignore` and exclude at least:

```text
____
npm-debug.log*
```

Hint: dependencies installed on your laptop should not enter the build context.
The container will install its own Linux-compatible dependencies.

Create `api/Dockerfile`:

```dockerfile
FROM ____

WORKDIR ____

COPY package.json package-lock.json ./

RUN npm ____

COPY src/ ./src/

ENV PORT=____

EXPOSE ____

CMD ["npm", "____"]
```

Hints:

- Reuse the Node 24 Alpine image from the frontend build stage.
- A conventional application directory is `/app`.
- Use the lockfile-oriented install command you learned in the first tutorial.
- `ENV`, `EXPOSE`, and the Express default should agree on the container port.
- `CMD` should invoke the package script you created.
- Copy package files before source so a source-only change can reuse the dependency
  installation layer.

Build the API image:

```sh
docker build -t learn-docker-api ./api
```

Run it independently, temporarily publishing its port to your laptop:

```sh
docker run --rm --name learn-docker-api -p 3000:3000 learn-docker-api
```

In another terminal:

```sh
curl -i http://localhost:3000/api/status
docker exec learn-docker-api sh -c 'ps && hostname'
```

Checkpoint: compare the JSON hostname with the output of `hostname` inside the
container. They should describe the same container.

Stop the foreground container with Ctrl+C.

Think it through: `EXPOSE 3000` documents the listening port. Which part of the
`docker run` command actually made that port reachable from your laptop?

## 3. Configure Nginx as a reverse proxy

Create `nginx/default.conf`:

```nginx
server {
    listen ____;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://____:____;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Hints:

- Nginx already listens on container port `80`.
- The upstream host is not `localhost`. It will be the API's Compose service name.
- The upstream port is the API's container port, not a host port.
- Keep the `/api/status` request path unchanged as it crosses the proxy. In Nginx,
  a `proxy_pass` URL without a URI component preserves the request URI. A trailing
  slash after the port changes that behavior.
- The Nginx [`proxy_pass` documentation](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)
  explains the URI replacement rules.

Now update only the final Nginx stage of the root `Dockerfile`. Add an instruction
that copies `nginx/default.conf` from the build context to:

```text
/etc/nginx/conf.d/default.conf
```

Use this incomplete instruction:

```dockerfile
COPY ____ ____
```

Checkpoint: rebuild the frontend image. It should still build, but you cannot fully
test the proxy until Nginx and the API share a network.

```sh
docker build -t learn-docker .
```

Optional inspection:

```sh
docker run --rm learn-docker cat /etc/nginx/conf.d/default.conf
```

Why will `localhost:3000` not work as the upstream from inside Nginx? Inside a
container, `localhost` refers to that same container, not to your laptop or another
container.

## 4. Define both services with Compose

Create `compose.yaml` at the repository root:

```yaml
services:
  frontend:
    build:
      context: ____
      dockerfile: ____
    ports:
      - "____:____"
    depends_on:
      - ____

  api:
    build:
      context: ____
      dockerfile: ____
```

Hints:

- The frontend build context is the repository root.
- The API build context is its own directory.
- Publish laptop port `8080` to Nginx's container port.
- The dependency name must exactly match the API service name.
- Do not add `ports` to the API service. Other containers can reach its container
  port over the Compose network without publishing that port to the host.
- You do not need to declare a custom network. Compose creates a default network,
  and services on it are discoverable by service name. See Docker's
  [Compose networking guide](https://docs.docker.com/compose/how-tos/networking/).

Validate the YAML before starting anything:

```sh
docker compose config
```

Then build and start both services:

```sh
docker compose up --build -d
docker compose ps
```

Check each boundary:

```sh
# Host -> Nginx
curl -I http://localhost:8080

# Host -> Nginx -> API
curl -i http://localhost:8080/api/status

# Nginx container -> Compose DNS -> API
docker compose exec frontend wget -qO- http://api:3000/api/status

# Host -> API: this should fail because the API has no published port
curl --max-time 2 http://localhost:3000/api/status
```

Checkpoint: `docker compose ps` should show a published port only for `frontend`.

The service name stays stable even when Docker recreates a container with a new IP.
Applications should use the service name rather than discovering and storing a
container IP.

`depends_on` gives you dependency order, not application readiness. Compose only
knows a container is ready when you define and depend on a healthcheck. Docker's
[startup-order guide](https://docs.docker.com/compose/how-tos/startup-order/)
describes that distinction. For this exercise, the frontend will handle a temporary
API failure rather than adding healthcheck orchestration.

## 5. Connect the terminal `status` command

Open `src/html/index.html` and find the terminal command system. The current
`status` case reports only the Matrix and shape settings.

Add a small async function near that command system:

```js
async function fetchApiStatus() {
  const response = await fetch('____');

  if (!response.____) {
    throw new Error(`API returned HTTP ${response.status}`);
  }

  return response.____();
}
```

Hints:

- The browser should request the same-origin path `/api/status`.
- Do not use `http://api:3000` in browser JavaScript. The name `api` exists in
  Docker's internal DNS, not in your laptop browser's DNS.
- A Fetch response does not reject merely because the server returned `404` or
  `502`; check its success property yourself.
- Parse the successful body as JSON.

The command processor must now perform asynchronous work. Adjust its declaration,
then reshape the `status` case using this scaffold:

```js
case 'status': {
  showOutput('checking services...');

  try {
    const api = await ____();
    showOutput(
      `frontend: online | api: ${api.____} | host: ${api.____} | ` +
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

Hints:

- Add `async` to the function containing `await`.
- Call the helper you just wrote.
- Read the `status` and `hostname` properties returned by Express.
- The braces around the `case` give its `const` binding a local block scope.
- Keep the error visible to users, but send the detailed error to the developer
  console.

Rebuild and recreate changed services:

```sh
docker compose up --build -d
```

Open `http://localhost:8080`, wait for the terminal prompt, enter `status`, and
compare the displayed hostname with:

```sh
docker compose exec api hostname
```

Checkpoint: the terminal should report both frontend state and live API state.

## 6. Test failure and recovery

Stop only the API:

```sh
docker compose stop api
```

Gather evidence at each layer:

```sh
docker compose ps
curl -i http://localhost:8080/api/status
docker compose logs frontend
docker compose logs api
```

Now enter `status` in the browser.

Expected:

- the static site still loads because Nginx remains running;
- the proxied request fails;
- the terminal reports `api: unreachable` without breaking other commands;
- Nginx's logs contain evidence of the failed upstream connection.

Restart the API and retry without restarting the frontend:

```sh
docker compose start api
curl -i http://localhost:8080/api/status
```

Checkpoint: the request succeeds again without rebuilding or restarting the
frontend. This stop/start experiment keeps the same Compose service endpoint. A
later container recreation may assign a new IP, which is why consumers should use
service discovery and re-resolve names rather than store container IP addresses.

This is the debugging path to remember:

```text
Can the host reach Nginx?
  -> Can Nginx resolve and reach api:3000?
    -> Is Express listening on the expected interface and port?
      -> Does Express implement the path Nginx forwards?
```

## 7. Inspect what you shipped

Run these checks while the Compose application is running:

```sh
docker compose ps
docker compose images
docker compose exec frontend sh -c 'command -v node || echo "Node is absent from frontend"'
docker compose exec api sh -c 'command -v node && node --version'
docker compose exec frontend ls -lah /usr/share/nginx/html
docker compose exec api sh -c 'ls -lah /app && ls -lah /app/src'
```

Explain the result in your own words:

- Which container owns the generated browser assets?
- Which container owns the Express source and dependencies?
- Which container can resolve the hostname `api`?
- Why can your browser use `/api/status` but not `http://api:3000/api/status`?
- Why does the API need no host port?
- Which process is PID 1 in each container?

Clean up:

```sh
docker compose down
```

## Troubleshooting without guessing

| Symptom | Boundary to inspect | Useful evidence |
| --- | --- | --- |
| `npm ci` reports a missing lockfile | API build context -> dependency layer | Check that both package files exist under `api/` and are copied before `RUN`. |
| API container exits immediately | Container -> Node process | Run `docker compose logs api` and inspect the configured start script. |
| API works locally but not in its container | Container network -> listening socket | Check the listen interface, container port, and `docker compose exec api ps`. |
| Nginx returns `502 Bad Gateway` | Nginx -> API | Check the service name, API container port, running containers, and both services' logs. |
| Nginx returns `404` for `/api/status` | Proxy URI -> Express route | Compare the requested path, `location`, trailing slash behavior, and Express route exactly. |
| Static site works but displays `api: unreachable` | Browser -> Nginx API path | Inspect the browser console and Network tab, then reproduce with `curl`. |
| A frontend edit does not appear | Source -> image -> container | Rebuild and recreate with `docker compose up --build -d`; verify which image the running container uses. |
| `localhost:3000` unexpectedly succeeds | Host -> published ports | Check `docker compose ps` and whether an old standalone API container is still running. |

For each failure, state one hypothesis and run the smallest check that can disprove
it. Avoid changing several files before you know which boundary is broken.

## Optional extensions after the core exercise

Do these one at a time, rebuilding and testing after each:

1. Add an API healthcheck and make `frontend` depend on `service_healthy`. Observe
   how this differs from short-form `depends_on`.
2. Add a request counter stored in process memory. Restart the API and explain why
   the value resets.
3. Scale the API with Compose and repeatedly inspect the reported hostname. Research
   what Nginx would need to do to redistribute requests reliably.
4. Add a JSON 404 handler and centralized Express error handler.
5. Run the API as a non-root user and inspect its UID inside the container.
6. Add development-only Compose settings with a bind mount and Node watch mode,
   while keeping the production images unchanged.

You are done with the core mini-project when you can build it, demonstrate both
healthy and failed API behavior, and explain every network hop without referring to
a container IP address.
