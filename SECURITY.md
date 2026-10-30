# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub's private vulnerability reporting](https://github.com/MariusLang/chat-aide/security/advisories/new),
not in a public issue. Include the package and version, what an attacker can do, and the steps to
reproduce it. You can expect a first answer within a week.

## Supported versions

Fixes go into the latest release of each `@chat-aide/*` package.

## Scope

[docs/security.md](docs/security.md) describes what the chat endpoint refuses and what it cannot
prevent by design: the endpoint is callable by scripts and is bounded by the rate limit and the
token budgets. A way around one of those bounds, a read of anything other than a page of the
configured site, a key or a visitor's cookies reaching the model or the browser, or script running
from an answer is in scope.
