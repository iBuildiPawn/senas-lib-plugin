# Technical extraction playbook

The goal of the technical pass is not to document *every* detail — it is to give a new engineer a mental model dense enough that they can open the right file on the first try.

> For the concrete `Glob`/`Grep` invocations behind every search task in this playbook (manifest discovery, HTTP-client patterns by language, queue/RPC patterns, output-mode discipline, when to delegate to an `Explore` subagent), see `search-playbook.md` alongside this file.

## Per-unit checklist

For each unit (`.librarian/units/<name>.md`), fill in:

### 1. Purpose
One or two sentences. Not "handles orders" — something like "owns the order lifecycle from placement to fulfillment, including state transitions and payment coordination."

### 2. Tech stack
Framework, language runtime, key libraries that shape how code is written here. Reading the manifest (`composer.json`, `package.json`, `requirements.txt`, `go.mod`, etc.) is usually enough. Call out anything unusual — a custom fork, an unexpected pin, a framework version behind the rest of the repo.

### 3. Entry points
Where execution begins in this unit. Depending on the stack:
- HTTP API → routes file(s), controller list
- CLI → command definitions
- Background worker → job/consumer registrations
- Cron → scheduled task list
- Event consumer → topic subscriptions

Cite the file that enumerates them (e.g. `routes/api.php`, `app/Console/Kernel.php`, `src/index.ts`).

### 4. Data models owned
The entities this unit writes to authoritatively. Read the models directory + migrations directory. A useful pattern: "X owns Order, OrderItem, OrderStatusHistory. Reads User from Client-Server."

Watch for shared databases — if two units write to the same table, that is a critical fact for the architecture doc, not a per-unit footnote.

### 5. External dependencies
Split into:
- **Other units** — identify by looking at HTTP clients, Kafka publishers, shared packages imported.
- **Third-party APIs** — Stripe, Twilio, Odoo, SendGrid, OpenAI, etc. Search for the SDK import or the base URL in config.
- **Infra** — DBs, caches, queues, object storage this unit needs to run.

### 6. Observable side effects
What happens in the world when code here runs? DB writes, queue publishes, outbound HTTP, emails, files. This is what someone debugging production will care about.

### 7. Where to start reading
3-5 files. Usually: the main routes / handler registration file, the main service class for this unit's core responsibility, the primary model, one representative test, and the config file.

## Cross-unit interactions

Build a table in `.librarian/architecture.md`:

| From           | To            | Mechanism                  | Purpose                          |
|----------------|---------------|----------------------------|----------------------------------|
| Client-Server  | Order-Server  | HTTP POST /internal/orders | Create order after payment auth  |
| Order-Server   | Payment-Server| Kafka `payments.requests`  | Request payment capture          |
| Admin-Server   | (all)         | Internal HTTP w/ signer    | Management API                   |

Patterns to grep for when mapping interactions:
- HTTP clients: `Http::`, `axios`, `fetch`, `requests.get`, `httpx`, service base URLs in config
- Kafka/queues: producer + consumer classes, topic names (usually string constants)
- Shared DB access: same table name in migrations across units
- RPC/gRPC: `.proto` files, generated stubs
- Shared code: imports from a common `packages/*` or `shared/` directory

## Stack-specific hints

### Laravel (PHP)
- Routes live in `routes/api.php`, `routes/web.php`, `routes/console.php`.
- Service boundaries often show up as controllers → services → models.
- Jobs live in `app/Jobs/`; listeners in `app/Listeners/`; observers in `app/Observers/`.
- `config/` holds per-subsystem config — read `config/services.php` for external API URLs.
- Middleware in `app/Http/Middleware/` often tells you a lot about auth shape.

### Node / TypeScript
- Check `package.json` `scripts` for entry points.
- For Express/Fastify/Hono: route registration is typically in one file.
- For Next.js: `app/` (app router) or `pages/` (pages router); API routes in `app/api/` or `pages/api/`.
- Check `tsconfig.json` paths and workspace `package.json` files for internal package layout.

### Python
- `pyproject.toml` or `setup.py` defines entry points.
- FastAPI / Flask: routers and blueprints.
- Django: `urls.py` is the route tree; apps live in their own directories.
- Celery: tasks usually in `tasks.py` modules.

### Go
- `cmd/` conventionally holds entry points; `internal/` is private packages.
- HTTP handlers are typically registered in a `server.go` or similar.
- Look for `go.work` for multi-module repos.

### Java / Kotlin (Spring)
- Look for `@RestController`, `@Service`, `@Repository`, `@Configuration` annotations.
- `application.yml` / `application.properties` holds config.

### Ruby on Rails
- `config/routes.rb` is authoritative.
- Models in `app/models/`, controllers in `app/controllers/`, jobs in `app/jobs/`.

## Infra layer

A separate section in `architecture.md`:

- **Containerization** — Dockerfile per unit? Shared base image? What's in `docker-compose.yml`?
- **Orchestration** — k8s manifests in `k8s/` or `deploy/`? Helm charts?
- **CI/CD** — `.github/workflows/`, `.gitlab-ci.yml`, `circleci/`, `bitbucket-pipelines.yml`. Note which branches deploy where.
- **Environments** — env files (`.env.example`, `.env.staging`, etc.), environment-specific config.
- **Secrets** — vault integration, AWS Secrets Manager, k8s secrets — just note *where* secrets live, never their contents.

## What not to do

- Do not read every file. 200 files scanned with intent beats 2000 files skimmed.
- Do not document every function — document units and their seams.
- Do not copy code into the docs. Link to it with `file:line`.
- Do not invent architecture patterns the code does not follow. If it's a plain CRUD app, say so.
