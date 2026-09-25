# Why this isn't deployed

This function is excluded from `vercel.json` (not under `api/`) because it
currently fails Vercel deployment in two independent ways on the project's
current (Hobby) plan:

1. **Duration.** Hobby caps every function at 300s (both default and max,
   no extension). Real training runs are documented as taking several
   minutes and can exceed that -- the function would be killed mid-run even
   if it deployed.
2. **Bundle size.** With `torch` installed (even the CPU-only wheel), the
   function's bundle is ~800MB, over the standard 500MB Python limit --
   requiring the `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` large-functions beta.
   With that enabled, deployment consistently fails at the final
   "Deploying outputs" step with `ENOENT: no such file or directory` on a
   different installed package file each attempt (first `certifi`'s
   dist-info, then `cffi`'s compiled `.so`) -- this looks like a bug in
   Vercel's large-functions output-packaging step, not anything fixable
   from `requirements.txt` or project env vars. Confirmed by isolation:
   removing this function from `api/` lets the rest of the app (including
   the `query-ensemble` function, which doesn't need torch/large-functions)
   deploy cleanly.

To restore: `git mv training-job-disabled api/training-job`, add its entry
back to `vercel.json`, and re-add `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` in
Vercel's production env vars. Try that once Vercel's large-functions beta
has matured, or move to Vercel Pro first (duration cap alone still blocks
Hobby regardless of the bundling bug).

Until then, `api/training/route.ts` degrades gracefully: a "Start Training"
click creates a real `training_jobs` row and leaves it at `status: pending`
rather than faking progress, since `PYTHON_TRAINING_URL` has nothing behind
it in production.
