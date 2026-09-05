# Contributing to the 4D-ID Reference Resolver

This is the reference implementation of the [4D-ID specification](https://github.com/4d-id/spec). It exists to prove the spec is buildable, to serve as a conformance oracle, and to give implementers something to check themselves against.

## Ground rules

- The resolver follows the spec. If the resolver and the spec disagree, the spec wins and the resolver has a bug.
- Keep it faithful and readable over fast. Production performance is a separate concern; this is a reference.
- Every change runs the full test suite: `npm test` (schema validation, resolver smoke test, HTTP end-to-end, conformance run).

## Process

1. Open an issue.
2. PR with tests passing. New behaviour needs a test.
3. Update `CHANGELOG.md`.

See the [spec's contributing guide](https://github.com/4d-id/spec/blob/main/CONTRIBUTING.md) for how the standard itself evolves.
