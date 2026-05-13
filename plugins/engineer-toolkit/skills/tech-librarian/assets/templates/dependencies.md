# Dependencies

Third-party libraries and services this repo depends on, grouped by what they do. The goal is to answer "what does this lib do for us?" without reading its docs.

## Runtime libraries

| Package                          | Role in this repo                          | Pinned version | Notes |
|----------------------------------|--------------------------------------------|----------------|-------|
| `<package-name>`                 | <what it does *here*, not in general>      | `^x.y`         | <e.g. "custom fork pinned to hash abcd", or blank> |
| ...                              | ...                                        | ...            | ...   |

## External services
| Service             | What it does for us                            | Integration entry point |
|---------------------|------------------------------------------------|--------------------------|
| Stripe              | payment capture + refunds                      | `PaymentController@*`    |
| Twilio              | SMS delivery notifications                     | `NotificationService`    |
| ...                 | ...                                            | ...                      |

## Dev / tooling
<Things developers touch but that are not runtime deps — formatter, linter, test runner, build tool.>

## Suspicious / stale
<Dependencies pinned to a specific hash, custom forks, deprecated packages, major versions behind latest. Worth flagging so a future update does not surprise the team.>
