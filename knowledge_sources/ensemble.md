# Multi-LLM Ensemble Platform

The platform queries several independent large language models in parallel for a
single user prompt. Each candidate answer is scored for source support, bias,
and clarity, then the best parts are merged by a synthesis step into one final
answer.

## Why an ensemble improves answer quality

- Sends one prompt to several independent models in parallel.
- Scores each candidate for source support, bias, and clarity.
- Merges the best parts into a single balanced answer.
- Reduces model-specific blind spots because a weak claim from one model is
  likely to be contradicted by another.
- Bounds provider costs with a fixed candidate count and round-robin keys.

## Sources and grounding

Local files placed in knowledge_sources/ are chunked, tokenized, and retrieved
per question using token overlap. Retrieved chunks are quoted to the model as
sources, which improves factual support and lets answers cite [S#] markers.
Adding relevant files to knowledge_sources/ improves grounding over time.
