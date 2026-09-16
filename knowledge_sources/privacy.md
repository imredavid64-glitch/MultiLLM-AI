# Privacy and Redaction

Privacy redaction scans prompts and answers for sensitive patterns such as
emails, phone numbers, credit card numbers, and API key formats. When a pattern
matches, the text is replaced with a [REDACTED] marker before it is sent to
remote APIs.

Key behaviors:
- Redaction is best-effort, not perfect. Review answers for private data.
- Candidate answers are scanned again before the final answer is shown.
- Absolute wording is penalized by the bias score, and answers that present
  both sides of a tradeoff are preferred.
- Local inference with the tiny models avoids sending prompts to remote data
  centers, lowering the estimated carbon footprint per query.
