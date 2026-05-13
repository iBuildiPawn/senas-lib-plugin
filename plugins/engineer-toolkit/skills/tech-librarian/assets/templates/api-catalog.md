# API catalog

Externally-exposed APIs: HTTP, CLI, webhooks, RPC, queue consumers that external systems publish to.

> Internal unit-to-unit calls live in `architecture.md`, not here.

## HTTP APIs

### `<Unit name>` — base URL `<e.g. https://api.example.com/v1>`

| Method | Path                  | Auth     | Purpose                | Handler                         |
|--------|-----------------------|----------|------------------------|----------------------------------|
| POST   | `/orders`             | Bearer   | Create an order        | `OrderController@store` (`path:line`) |
| GET    | `/orders/{id}`        | Bearer   | Fetch an order         | `OrderController@show` (`path:line`)  |
| ...    | ...                   | ...      | ...                    | ...                              |

## Webhooks received
| From      | Path                        | Auth        | Purpose                 |
|-----------|-----------------------------|-------------|-------------------------|
| Stripe    | `/webhooks/stripe`          | signature   | payment events          |
| ...       | ...                         | ...         | ...                     |

## CLI commands
| Command                   | Purpose                          | Entry point               |
|---------------------------|----------------------------------|---------------------------|
| `php artisan orders:reconcile` | Nightly reconciliation job  | `app/Console/Commands/...` |
| ...                       | ...                              | ...                        |

## Queue / event consumers
| Topic / queue          | Consumed by   | Purpose                 |
|------------------------|---------------|-------------------------|
| `orders.events`        | Order-Server  | track order lifecycle   |
| ...                    | ...           | ...                     |
