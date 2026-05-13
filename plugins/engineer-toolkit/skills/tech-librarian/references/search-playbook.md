# Search playbook

The tech-librarian skill is search-heavy by nature. This file maps the tasks in `learn-technical.md` to concrete `Glob` and `Grep` invocations so a Learn pass spends tokens on signal, not on figuring out which tool to reach for.

Three rules cover most decisions:

- **Glob** finds files by name. Cheap. Returns paths sorted by modification time, which usefully surfaces the actively-touched part of the repo first.
- **Grep** finds patterns inside files. Built on ripgrep — respects `.gitignore` automatically, parallelises across cores. Default `output_mode: "files_with_matches"` (paths only) unless you actually need the matched lines.
- **`Agent(subagent_type: "Explore")`** delegates an open-ended search to a separate context window. Use when reading the matches would bloat your main context.

Avoid Bash `grep`/`rg`/`find` — every call prompts for permission and dumps unstructured text. The dedicated tools are pre-approved and let you bound output via `head_limit`.

---

## Step 1 — Repo shape

### Manifest discovery (one Glob)

```
Glob("**/{package.json,pyproject.toml,setup.py,go.mod,Cargo.toml,composer.json,pom.xml,build.gradle,build.gradle.kts,*.csproj,Gemfile,Package.swift,mix.exs,deno.json,bun.lockb}")
```

Sorted by mtime. The most recently touched manifest is the active stack. If the result list is long and spans several languages, you're in a polyglot monorepo — check for the workspace-config files below before diving in.

### Monorepo / workspace detection

```
Glob("**/{lerna.json,pnpm-workspace.yaml,turbo.json,nx.json,rush.json,go.work,Cargo.toml}")
```

(Cargo workspaces declare `[workspace]` inside `Cargo.toml`, so include that one and grep its body if found.)

A non-empty `services/`, `packages/`, `apps/`, or `libs/` directory at the repo root is also a strong monorepo signal. Glob first to confirm, then enumerate units.

### Infra shape

```
Glob("{Dockerfile*,docker-compose*.{yml,yaml},Procfile,fly.toml,vercel.json,serverless.yml,railway.toml,**/k8s/**,**/terraform/**,.github/workflows/*.yml,.gitlab-ci.yml,bitbucket-pipelines.yml,.circleci/config.yml}")
```

Existence is the signal. You don't need to read the contents at this stage — just record what's present in `overview.md`.

---

## Step 2/3 — Cross-language idiom search

Use `Grep` with `type:` (a built-in ripgrep file-type set) over `glob:` whenever a type exists for the language. Type matching is faster.

### HTTP clients

| Stack       | Recipe                                                                                             |
|-------------|----------------------------------------------------------------------------------------------------|
| TS / JS     | `Grep(pattern: "axios|\\bfetch\\(|got\\(|ky\\(|undici|node-fetch", type: "ts", output_mode: "files_with_matches", head_limit: 50)` |
| Python      | `Grep(pattern: "requests\\.(get|post|put|patch|delete)|httpx\\.|aiohttp", type: "py")`             |
| Go          | `Grep(pattern: "http\\.(Client|Get|Post|Do)|resty\\.", type: "go")`                                |
| Java        | `Grep(pattern: "RestTemplate|WebClient|HttpClient|OkHttpClient|Feign", type: "java")`              |
| PHP         | `Grep(pattern: "GuzzleHttp|Http::|file_get_contents\\(.https", type: "php")`                       |
| Ruby        | `Grep(pattern: "Net::HTTP|HTTParty|Faraday|RestClient", type: "ruby")`                             |

Then `Read` the 3-5 most plausible files (matched paths sorted by mtime are a reasonable triage). Don't `Read` everything Grep returned — `files_with_matches` is a discovery list, not a reading list.

### Queues / messaging

| Stack       | Recipe                                                                                                |
|-------------|-------------------------------------------------------------------------------------------------------|
| Kafka       | `Grep(pattern: "@KafkaListener|KafkaTemplate|KafkaProducer|KafkaConsumer|kafkajs|confluent-kafka")`   |
| RabbitMQ    | `Grep(pattern: "amqplib|pika|RabbitTemplate|@RabbitListener|bunny")`                                  |
| Redis pub/sub | `Grep(pattern: "Redis\\.publish|XAdd|XRead|subscribe\\(", type: "ts")` (adjust per stack)            |
| AWS SQS/SNS | `Grep(pattern: "SQSClient|SendMessageCommand|SNSClient|@aws-sdk/client-sq")`                          |
| GCP Pub/Sub | `Grep(pattern: "PublisherClient|SubscriberClient|google.cloud.pubsub")`                               |
| Temporal    | `Grep(pattern: "@WorkflowMethod|@ActivityMethod|temporal\\.client|workflow\\.execute")`               |

### RPC

```
Glob("**/*.proto")                                  # gRPC service definitions
Grep(pattern: "@RemoteService|connect-go|@grpc/grpc-js")
```

### Cron / scheduled work

| Stack    | Recipe                                                                       |
|----------|------------------------------------------------------------------------------|
| Node     | `Grep(pattern: "node-cron|bullmq|agenda|@nestjs/schedule", type: "ts")`      |
| Laravel  | `Read("app/Console/Kernel.php")` directly — it's the canonical source        |
| Django   | `Read("**/celery.py")` + `Grep(pattern: "@shared_task|@app.task", type: "py")` |
| Spring   | `Grep(pattern: "@Scheduled", type: "java")`                                   |
| K8s CronJob | `Grep(pattern: "kind:\\s*CronJob", glob: "**/*.{yml,yaml}")`               |

---

## Output mode discipline

| Mode                  | When                                                                  |
|-----------------------|-----------------------------------------------------------------------|
| `files_with_matches`  | **Default.** You'll act on the file list (Read, edit, count, group).  |
| `content`             | When the matched lines themselves are the answer (e.g. enumerate every route declaration).  |
| `count`               | Metrics — how many places call X, how many tests reference Y.         |

`head_limit` defaults to 250. Don't pass `head_limit: 0` casually — it disables truncation and pulls every result into context. For pagination, pair `offset` with `head_limit` instead.

`multiline: true` is needed for patterns spanning newlines (e.g. find class declarations whose body contains a specific field). It's slower; don't enable it by default.

`-A` / `-B` / `-C` only apply when `output_mode: "content"`. They're noise on `files_with_matches`.

---

## When to delegate to an `Explore` subagent

Hand off to an `Agent(subagent_type: "Explore")` when:

- The investigation will read 10+ files you won't reference again afterward.
- The question is open-ended ("how does auth flow", "what does Order-Server actually do") and you want a paragraph back, not a wall of matches.
- You're running the same 7-point unit-extraction rubric across many units of a monorepo (see `assets/templates/explore-subagent-prompt.md` for the per-unit template).

Do **not** delegate when:

- You need the raw file paths to feed into your next action — Glob/Grep return them directly.
- The search is one Grep deep (pattern → handful of matches → done).
- You're verifying a specific claim against a known file — `Read` is faster.

---

## What NOT to do

- **Don't shell out to `grep`/`rg`/`find`.** Each invocation prompts for permission and dumps unstructured text into your context. The dedicated tools are pre-approved and shape their output.
- **Don't add manual `node_modules`/`dist`/`build` exclusions.** Grep respects `.gitignore` automatically. If you want to search ignored files, that's a Bash escape hatch — and you almost never want to.
- **Don't enable `multiline: true` reflexively.** It's an order of magnitude slower than single-line. Use it only when the pattern genuinely crosses a newline.
- **Don't `Read` every file Grep returned.** A `files_with_matches` result is a candidate list. Pick the 3-5 most plausible by name and read only those.
- **Don't pass `head_limit: 0`.** Default 250 is a safety rail — turning it off is how a search response eats half your context budget.
