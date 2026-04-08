## Summary

<!--
What changed and why. One or two sentences. Point at the user problem
this solves or the bug this fixes.
-->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Docs
- [ ] Prompt / AI generation change

## Testing

- [ ] `pnpm test` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes

## If this PR touches `packages/shared/src/ai.ts` or any prompt

The unit tests are all mocked — they can't tell us whether your change
makes the generated articles better or worse. Run the real-world smoke
test and paste the evidence below.

- [ ] I ran `pnpm smoke --baseline`
- [ ] I diffed `baseline/` vs `current/` and the `current/` output is better or equal
- [ ] Total Gateway spend was under $0.10
- [ ] At least one generated article was compile-checked in `apps/web`

<details>
<summary>Smoke test diff (baseline vs current)</summary>

```
Paste a summary of the diff here. The fastest format is:

vercel.com:
  baseline titles: [...]
  current titles:  [...]
  improvements:    [...]
  regressions:     [...]

resend.com:
  baseline titles: [...]
  current titles:  [...]
  improvements:    [...]
  regressions:     [...]

Total Gateway spend: $X.XX
```

</details>

## Screenshots / recordings

<!-- For UI changes only. Drop in GIFs or screenshots. -->

## Related issues

<!-- e.g. Closes #123, Refs #456 -->
