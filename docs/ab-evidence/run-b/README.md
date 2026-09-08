# Run B — evidence (ad-hoc, ticket only)

**This is the third attempt.** The first two were invalidated during code
review and are not used for the comparison in `docs/ab-validation.md` — kept
here only as a methodology note:

1. **Attempt 1** — worktree still contained `docs/walkthrough.md`, which
   describes the A/B methodology itself ("Прогін B — ... агенту дано лише
   `materials/feature-request.md`, без специфікації"). The agent's own
   summary referenced "this branch's role in the A/B comparison" — it had
   almost certainly read that file.
2. **Attempt 2** — repo-level meta files (`walkthrough.md`, `README.md`,
   `AGENTS.md`, `CLAUDE.md`, `.github/`, `.coderabbit.yaml`) were stripped
   from the working tree, but the worktree still carried the **git history**
   of the real homework repo, including ancestor commits literally titled
   "WS7 homework: SDD over a deliberately ambiguous pricing ticket" and a
   setup commit of ours titled "...for a blind ad-hoc run". A single
   `git log` would have leaked the whole experiment. The agent's summary
   again referenced "no separate spec doc for this run", suggesting it had
   read the log.

**Attempt 3 (used below) fixes both:** a brand-new, standalone git repo
(`git init`, no relation to the homework repo), containing only
`app/src/{types.ts,pricing.ts,pricing.test.ts,index.ts}`,
`app/package.json`, `app/tsconfig.json`, and `materials/feature-request.md`,
with a single neutral `"Initial commit"`. Its result text makes no
reference to a spec, an experiment, or "this run" — it just states the
decisions it made from the ticket.

- **base commit:** neutral `1238c32 Initial commit` (no ancestry, no exercise references)
- **result commit:** `9193dc7 Add discount engine` — the agent's own output, unmodified
- **command:** `claude -p "$(cat prompt.txt)" --model claude-sonnet-5 --permission-mode bypassPermissions --output-format json`
- **prompt.txt** — exact prompt given to the agent (identical in shape to Run A's, pointing at the ticket instead of the spec)
- **result.diff** — `git diff` of `app/src/discounts.ts` and `app/src/discounts.test.ts` between the two commits (unlike Run A, this run never touched `app/src/index.ts` — its function isn't wired into the public surface at all)
- **test-output.txt** — `npm test` output against the agent's own code (25/25 green)
- **metrics.json** — full `--output-format json` result (`num_turns`, `duration_ms`, `total_cost_usd`)
