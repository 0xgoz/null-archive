# Build your site with a multi-stage Dockerfile

Your task: turn the existing Dockerfile into a two-stage build. The npm setup is ready; the Dockerfile is still yours to write. Replace every `____` below before running an exercise. There is no completed Dockerfile hidden in this guide.

The intended flow is:

```text
Source + npm packages → Node / Vite build → dist/ → Nginx → browser
```

Node runs while Docker builds the image. Nginx runs when you start a container. Only the generated site needs to cross between stages. Each `FROM` starts a separate filesystem based on its chosen image; files are not automatically carried forward. See Docker's [multi-stage introduction](https://docs.docker.com/get-started/docker-concepts/building-images/multi-stage-builds/).

## 1. Understand the prepared npm build

There was no Tailwind in this page: its styles are custom CSS. Three.js now comes from npm at the same version as the old CDN import. The font comes from `@fontsource/press-start-2p`.

- `package.json`: dependencies and commands you can run.
- `package-lock.json`: records the resolved dependency versions; keep it with the project.
- `vite.config.js`: reads `src/html/index.html` and writes the finished site to `dist/` at the project root.
- `src/html/index.html`: imports Three.js and the font; Vite bundles the JavaScript, font CSS, font files, and referenced images.
- `.dockerignore`: excludes local `node_modules`, `dist`, `.git`, and your existing `password.txt` pattern from Docker's build context.

For local development, use Node 24 and run these commands from the project root:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Stop the server with Ctrl+C. Then generate and preview the production output:

```sh
npm run build
npm run preview
```

Check the intro, navigation, terminal commands, and font. In browser DevTools, the Network tab should show local JS, CSS, and font requests, with no jsDelivr or Google Fonts downloads. Stop the preview with Ctrl+C.

Vite resolves the npm imports into browser-ready assets during its [production build](https://vite.dev/guide/build). Fontsource documents the [self-hosted font import](https://fontsource.org/fonts/press-start-2p/install).

**Checkpoint:** inspect `dist/`. Can you find the generated HTML, JS, CSS, and font files? Small images may be embedded as data URLs. `password.txt` should not be there: the build bundles referenced assets, and public-directory copying is disabled.

The original Dockerfile copies raw source, so it will no longer serve the complete app correctly until you finish this exercise. Use Vite for previewing in the meantime.

## 2. Write the build stage

Open your Dockerfile. Replace its contents using this incomplete scaffold as your starting point:

```dockerfile
# Start from Node 24 on Alpine; give this stage a name.
FROM ____ AS build

# Set the directory used by subsequent instructions.
____ /app

# Copy only the dependency manifest and lockfile first.
COPY ____ ____ ./

# Install exactly what the lockfile specifies.
RUN npm ____

# Copy the Vite config and the page source, preserving the source path.
COPY vite.config.js ./
COPY ____ ./src/

# Generate the production site.
RUN npm run ____
```

Hints:

- Image names use `name:tag`; here the name is `node` and the tag is `24-alpine`.
- The working-directory instruction is listed in the [Dockerfile reference](https://docs.docker.com/reference/dockerfile/).
- Look at the two `package` files in the project root.
- You already used the install and build commands in exercise 1.
- The source directory in your project root is `src`.
- Install dev dependencies too: Vite is a build tool listed in `devDependencies`. Do not use `--omit=dev` in this stage.

**Think it through:** why install dependencies before copying the source? If only `index.html` changes, Docker can reuse the dependency-install layer. Changing the package files invalidates that layer. This ordering follows Docker's [cache guidance](https://docs.docker.com/build/cache/optimize/).

## 3. Write the serving stage

Append this second incomplete stage:

```dockerfile
FROM nginx:alpine

# Copy the generated site from the named build stage.
COPY --from=____ ____ /usr/share/nginx/html/

# Document the port on which Nginx listens.
EXPOSE ____

CMD ["nginx", "-g", "daemon off;"]
```

Hints:

- The first blank refers to the name after `AS` in the first stage.
- The second blank is an absolute path inside that stage. Combine its working directory with the build output directory.
- Nginx's default HTTP port is 80.
- `COPY --from` reads another stage; ordinary `COPY` reads your local build context.
- The final image needs the output, not `node_modules` or your source folder.
- `EXPOSE` documents a port. Publishing it to your laptop is a separate step.
- Keeping Nginx in the foreground lets it remain the container's main process.

**Checkpoint:** explain which command executes during image construction and which command executes when you start a container: `RUN` or `CMD`?

## 4. Build and run

Make sure Docker is running. Fill in the commands from the project root:

```sh
docker ____ -t learn-docker .
docker ____ --rm -d --name learn-docker -p ____:____ learn-docker
```

Hints:

- First create an image, then start a container from it.
- The trailing `.` is the build context: the project files Docker can access, subject to `.dockerignore`.
- Port publishing is `HOST_PORT:CONTAINER_PORT`. Use 8080 on your laptop and Nginx's HTTP port inside the container.
- `-d` runs in the background; `--rm` removes this container when it stops.

Open `http://localhost:8080` and repeat the page checks from exercise 1.

```sh
curl -I http://localhost:8080
```

Expected: HTTP 200. This checks serving; the browser checks the JavaScript behavior and appearance.

## 5. Inspect what you shipped

These checks are complete commands so you can use them to evaluate your work:

```sh
docker exec learn-docker ls -lah /usr/share/nginx/html
docker exec learn-docker sh -c 'command -v node || echo "Node is absent, as expected"'
docker exec learn-docker sh -c 'test ! -e /usr/share/nginx/html/password.txt && echo "password.txt is absent"'
```

Expected: generated site files, no Node executable, and no password file. The build stage used Node, but the final stage starts from Nginx and copies only `dist/`.

Finish by stopping your container:

```sh
docker ____ learn-docker
```

Hint: the verb is the opposite of start.

## 6. Try the cache experiment

1. Build again without changing files. Look for cached steps.
2. Change some visible text in `src/html/index.html`.
3. Build again. Dependency installation should be cached; copying source and building the site should run again.
4. Start a new container from the rebuilt image to see the change. An already-running container does not update when you rebuild its image.

Optional: inspect the build stage directly. Fill in its name:

```sh
docker build --target ____ -t learn-docker-build .
docker run --rm learn-docker-build ls -lah /app/dist
```

## If something goes wrong

| Symptom | What to check |
| --- | --- |
| Docker cannot connect to its daemon | Start Docker Desktop or your Docker runtime. |
| `npm ci` cannot find its lockfile | Both package files must be copied before the install step. |
| `vite: not found` | Install dev dependencies in the build stage. |
| Vite cannot find `index.html` | Preserve `src/html/index.html` when copying source. |
| `COPY --from` cannot find the output | Check the stage name and absolute output path under `/app`. |
| Browser reports an unresolved `three` import | Serve built output, not the original HTML. |
| Nginx welcome page appears | Check where the built `index.html` was copied. |
| Port or container-name conflict | Stop the previous exercise container or use another host port/name. |

You are done when you can build from source inside Docker, browse the working site, and explain why Node is absent from the final image.
