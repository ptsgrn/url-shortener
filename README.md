# URL Shortener

A simple URL shortener service built with Elysia, Drizzle ORM, and D1 SQLite. It allows users to shorten long URLs and redirect to the original URL when accessing the shortened link. Also have simple analytics to track the number of clicks on each shortened URL and the ability to manage user accounts and moderation on the shortened URLs.

## Setup

This repository uses [bun](https://bun.sh/) as the package manager. Make sure you have bun installed on your machine. Also this project uses [turborepo](https://turbo.build/repo) to manage multiple packages.

After setting up bun, you can install the dependencies by running the following command in the root directory of the project:

```bash
bun install
```

Next, setting up your environment variables. You can copy the `apps/web/.dev.vars.example` file to `apps/web/.dev.vars`. `JWT_SECRET` is used to sign the JWT token for authentication. You can generate a random secret using `openssl rand -hex 32` command. Uncommenting `DEV_TOOLS=true` enables the [dev sign-in endpoints](#signing-in-without-google), so you can sign in without Google during development. And for `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, while not required on development, you can create a project on [Google Cloud Console](https://console.cloud.google.com/) and create OAuth 2.0 credentials to get the client ID and secret. You can also use [this guide](https://developers.google.com/identity/protocols/oauth2) to set up Google OAuth 2.0.

```bash
cp apps/web/.dev.vars.example apps/web/.dev.vars
```

Then create the local database by applying the migrations:

```bash
bun run --cwd apps/web db:migrate
```

This should good to go! Use the `bun dev` command to start the development server. Frontend will be available at `http://localhost:3000` and openapi spec API will be available at `http://localhost:3000/api/openapi`.

## Development

### Project Structure

This project is structured as a monorepo with the following packages:

```
apps/
  api/ - The backend Elysia API.
  web/ - The SvelteKit frontend.
packages/
  eslint-config/ - The shared ESLint config.
  typescript-config/ - The shared TypeScript config.
```

The `apps/api` is not an standalone Elysia but imported into the `apps/web` SvelteKit project. The `apps/web` is the main entry point of the application.

### Running the Development Server

To start the development server, run the following command in the root directory of the project:

```bash
bun dev
```

### Signing in Without Google

In development, the API serves helper endpoints under `/api/dev` that create users and sign in as any of them, so you can test logged-in features (such as creating links) without Google OAuth. Both regular users and admins can be mocked.

| Method | Path                       | Description                                                                                                                     |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/dev/users`           | List the users you can sign in as, with their role.                                                                             |
| `POST` | `/api/dev/users`           | Create a user and sign in as them. Body: `{ name?, email?, avatarUrl?, role?: "user" \| "admin" }` (role defaults to `"user"`). |
| `POST` | `/api/dev/users/:id/login` | Sign in as an existing user.                                                                                                    |

Signing in sets the same session cookies as a Google sign-in. The easiest way to call them is the OpenAPI page at `http://localhost:3000/api/openapi` (the "Dev" tag), or with curl:

```bash
# Create an admin and save the session cookies
curl -c cookies.txt -X POST http://localhost:3000/api/dev/users \
  -H 'content-type: application/json' -d '{"name":"Ada","role":"admin"}'

# Use the session
curl -b cookies.txt http://localhost:3000/api/v1/auth/me
```

These endpoints sign in as anyone without credentials, so they are locked down. Each of these checks alone keeps them off (see `apps/api/src/modules/dev/guard.ts`):

1. They are only mounted in development (`bun dev`). Production builds don't include them.
2. `DEV_TOOLS=true` must be set in `apps/web/.dev.vars`. **Never set it as a Wrangler secret or var.**
3. Every request must be made to `localhost` from the same machine. Anything else gets `404 DEV_DISABLED`.

After changing `DEV_TOOLS`, restart `bun dev`; `.dev.vars` is only read at startup.

### Browsing the Database

To inspect or edit the local D1 database with [Drizzle Studio](https://orm.drizzle.team/drizzle-studio/overview), run the following command in the root directory of the project:

```bash
bun db:studio
```

Then open [https://local.drizzle.studio](https://local.drizzle.studio) in your browser. It opens the same local database that `bun dev` uses, so apply the migrations first with `bun run --cwd apps/web db:migrate`.

### Testing

Running the tests can be done by running the following command in the root directory of the project:

```bash
bun test
```

For writing tests, you can use the `bun test --watch` command to run tests in watch mode. This will automatically rerun the tests whenever you make changes to the code. More information on testing can be found in the [bun documentation](https://bun.sh/docs/cli/test).

## Deployment

Production runs on Cloudflare Workers, built and deployed by [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) on every push. The repository holds no account state: `apps/web/wrangler.jsonc` names the D1 database (`url-shortener`) but has no database ID. The first deploy creates the database and links it to the Worker, and later deploys stay linked. Secrets live in Cloudflare, never in the repository.

### First-time setup

1. In the Cloudflare dashboard, go to **Workers & Pages → Create → Import a repository** and pick this repository. Name the Worker `url-shortener`, the `name` in `apps/web/wrangler.jsonc`.
2. Set the build settings:

   | Setting        | Value                    |
   | -------------- | ------------------------ |
   | Root directory | `apps/web`               |
   | Build command  | `bun run build`          |
   | Deploy command | `bun run deploy`         |
   | Build variable | `BUN_VERSION` = `1.3.14` |
   | Build variable | `NODE_VERSION` = `24`    |

3. After the Worker is created, add its secrets under **Settings → Variables and Secrets** (or with `bunx wrangler secret put <NAME>` in `apps/web`):
   - `JWT_SECRET`: generate one with `openssl rand -hex 32`.
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: from your Google OAuth client. Add `https://<your-domain>/api/v1/auth/google/callback` to its authorized redirect URIs.

   Never set `DEV_TOOLS` in production.

### What a deploy does

`bun run deploy` (`apps/web/scripts/deploy.ts`) applies the D1 migrations in `apps/api/drizzle` and runs `wrangler deploy`. If the database already exists, it migrates first, so new code never runs against an old schema. On the very first deploy it deploys first, which creates the database, then migrates. Keep migrations backward compatible (add columns and tables rather than renaming or dropping them in the same release), since the running Worker serves requests while they apply.

You can also deploy from your machine after `bunx wrangler login`, by running `bun run deploy` in `apps/web`. If Wrangler writes a `database_id` into `wrangler.jsonc` while doing so, don't commit it.
