# Answer Scoring

Candidate answers are ranked by a weighted total score:
- Source support measures how much of an answer can be backed by retrieved
  local sources. Answers that reference [S#] citations score higher.
- The bias score penalizes absolute wording ("always", "never", "guaranteed")
  and rewards balanced framing that presents tradeoffs.
- The clarity score rewards concise structured answers: very short answers get
  partial credit, answers up to a few hundred words score highest, and
  structured answers (short paragraphs or bullet lists) score higher still.

The top candidates are then merged by a final synthesis step that keeps only
claims with source support, preserves balanced framing, and explains conflicts.

## Learned scoring

A tiny scorer model (TinyScorer) trained from scratch on labeled examples
predicts source_support, bias_score, and clarity_score for any answer. It is
blended 50/50 with the heuristic scoring functions when available.
