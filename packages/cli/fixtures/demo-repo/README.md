# helpbase sync demo fixture

Bundled with the `helpbase` CLI. Used by `helpbase sync --demo` to show
what a real sync proposal looks like without requiring an API key or a
real repo.

The fixture models a simple scenario:

- `src/auth.ts` (pretend code) changes the API key header from
  `X-API-Token` to `Authorization: Bearer`.
- `docs/authentication.mdx` (pretend docs) still documents the old header.
- `proposals.json` is the cached LLM response that would be returned if
  the real pipeline ran against that diff. It contains one `SyncProposal`
  with a citation into `src/auth.ts:12-18`.

When you run `helpbase sync --demo`, the CLI renders `proposals.json`
through the real diff renderer. No network, no API key, same output
shape as the real command.
