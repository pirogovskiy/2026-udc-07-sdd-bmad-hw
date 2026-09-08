# Run A — evidence (with the spec)

- **base commit:** `c339625` (Money reads in hryvnia; promo code wording — last upstream commit before any homework work)
- **seed commit:** `dcb93ff` — `docs/spec/pricing-discounts.md` (Task A, agreed) copied into the worktree, nothing else
- **result commit:** `c8083aa` — the agent's own `app/src/discounts.ts`, `app/src/discounts.test.ts`, and the `index.ts` re-export, unmodified after generation
- **command:** `claude -p "$(cat prompt.txt)" --model claude-sonnet-5 --permission-mode bypassPermissions --output-format json`
- **prompt.txt** — exact prompt given to the agent
- **result.diff** — `git diff dcb93ff..c8083aa`, i.e. exactly what the agent wrote
- **test-output.txt** — `npm test` output against the agent's own code
- **metrics.json** — full `--output-format json` result (includes `num_turns`, `duration_ms`, `total_cost_usd`)
