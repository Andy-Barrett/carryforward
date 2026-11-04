# Fixed first-pass evaluation

Twelve author-created fictional visits are defined in `cases.mjs`, with expected outcomes separated from model input. Eight are development cases and four are reserved first-pass cases that were not used to tune the product prompt. This is not an independently blinded or representative field dataset. The existing prompt was developed before this suite; no claim is made that all cases are unfamiliar to its author.

The baseline is an ordinary Operations summary using the same model, input text/images, reasoning level and output cap. Its prompt explicitly asks for corrections, deferrals and source IDs; it is not deliberately instructed to ignore important evidence. The different output purposes remain a limitation: CarryForward returns validated branch proposals and a question, while baseline prose requires manual coding.

The runner alternates which variant runs first, samples each once, keeps every refusal and failure, and makes no automatic retries. Expected outcomes, case input hashes, product request hashes, baseline prompt, model/settings and source commit are sealed in each run manifest before dispatch. Raw visible model text and usage are retained under ignored `.local/evaluations/`; encrypted/private reasoning is not saved.

Run without `--live` for a no-cost manifest preview. Live runs must use the existing aggregate guard and approved private token file:

```
node scripts/evaluate.mjs --live --out=.local/evaluations/first-pass --token-file=/private/runtime/guard.token
```

Do not reset the ledger or run a second copy while a run is active. A run directory cannot be silently reused. Results are persisted after each request, so a stopped run remains inspectable. No case expectations are sent to either model.

Structured scoring measures unsupported supported outcomes, missed support, missing owners, deferral handling and question targeting/suppression. Image-detail substring checks only flag records for review. They are not semantic verdicts. A refused output is a failed usable response, not a correct answer. Baseline prose must be annotated against the same per-branch rubric before comparing omissions or unsupported claims. Human effort is not measured by API time; do not invent interaction-time benefits.

Token costs are estimates from published standard rates and reported usage, not invoices. Aggregate guard reservations include conservative margins and are reported separately. Do not tune on reserved results and then describe the same cases as held out.
