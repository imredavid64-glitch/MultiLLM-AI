"""Synthetic training corpus for the Multi-LLM ensemble.

The ensemble architecture (see ai_client.py) answers via parallel "bots" that:
  - cite local sources with [S#] markers
  - present balanced tradeoffs instead of one-sided framing
  - mark uncertainty explicitly
  - avoid absolute language ("always", "never", "guaranteed")
  - stay concise and structured

Because knowledge_sources/ is empty, we generate a deterministic synthetic
corpus that teaches those patterns. The same generator produces labeled
examples for the answer-quality scorer.
"""
from __future__ import annotations

import itertools
import json
import random
from pathlib import Path
from typing import Dict, List, Tuple

PERSONAS = [
    ("Factual Analyst", "Prioritize precise facts and explicit assumptions."),
    ("Skeptical Reviewer", "Challenge weak claims and point out uncertainty."),
    ("Neutral Teacher", "Explain clearly for non-experts with minimal jargon."),
    ("Risk Auditor", "Look for safety, privacy, and compliance risks."),
    ("Counter-Bias Bot", "Actively detect one-sided framing and rebalance perspectives."),
]

# (question, source snippet, grounded-answer skeleton)
DOMAIN_EXAMPLES: List[Tuple[str, str, str]] = [
    (
        "How does a multi-LLM ensemble improve answer quality?",
        "An ensemble queries several independent models in parallel and merges the best parts.",
        "A multi-LLM ensemble sends one prompt to several independent models in parallel. Each candidate is scored for source support, bias, and clarity, and the best parts are merged into a single answer. This reduces model-specific blind spots because a weak claim from one model is likely to be contradicted by another.",
    ),
    (
        "Is local knowledge grounding useful for chat assistants?",
        "Local files placed in knowledge_sources/ are chunked and retrieved per question.",
        "Local knowledge grounding helps a chat assistant answer from a trusted, curated corpus. Files in knowledge_sources/ are chunked, tokenized, and retrieved per question using token overlap. Retrieved chunks are quoted to the model as sources, which improves factual support and lets answers cite [S#] markers.",
    ),
    (
        "Why is bias reduction important in AI answers?",
        "Answers that present both sides of a tradeoff are less misleading.",
        "Bias reduction matters because a single model can frame an issue one-sidedly. The ensemble scores candidates for absolute words and rebalances perspectives, so the final answer presents tradeoffs rather than a single confident opinion. Presenting both sides reduces the chance that users make decisions on a lopsided summary.",
    ),
    (
        "What is privacy redaction in this system?",
        "Sensitive patterns like emails and keys are redacted before API calls.",
        "Privacy redaction scans prompts and answers for sensitive patterns such as emails, phone numbers, credit card numbers, and API keys. When a pattern matches, the text is replaced with a [REDACTED] marker before it is sent to remote APIs. This keeps private identifiers out of third-party request logs.",
    ),
    (
        "How are the candidate answers ranked?",
        "Candidates are ranked by source support, bias score, and clarity score.",
        "Candidate answers are ranked by a weighted total score. Source support measures how much of an answer can be backed by retrieved local sources, the bias score penalizes absolute wording, and the clarity score rewards concise structured answers. The top candidates are then merged by a final synthesis step.",
    ),
    (
        "Can I add my own documents to the system?",
        "Drop supported text files into the knowledge_sources folder.",
        "Yes. You can drop supported files, like .txt, .md, or .csv, into the knowledge_sources folder and run /reload. The system chunks each file and indexes the tokens so future questions can retrieve the most relevant passages and cite them as [S1], [S2], and so on.",
    ),
    (
        "Does the platform use renewable energy?",
        "The sustainability layer tracks estimated carbon usage of each query.",
        "The platform tracks an estimated carbon footprint for each query as a sustainability metric. It is one input among several; answer quality, latency, and cost are the primary selection criteria. The carbon estimate should be treated as approximate rather than an audited measurement.",
    ),
    (
        "What happens if one provider fails during a query?",
        "Each bot call is retried, and failed bots are excluded from ranking.",
        "Each provider call is retried with exponential backoff. If a bot still fails, its candidate is marked as failed and excluded from ranking. The ensemble continues with the remaining successful candidates, so a single provider outage does not block the final answer.",
    ),
    (
        "How do citations work in generated answers?",
        "Answers reference source chunks like [S1] and [S2] when they use them.",
        "When an answer uses a fact from a retrieved chunk, it includes a citation like [S1] or [S2] right after the claim. The citation maps to the source file the chunk came from. The source-support score also checks whether sentences share tokens with the cited chunks, so unsupported claims can be flagged.",
    ),
    (
        "What is the difference between training and fine-tuning?",
        "Training starts from scratch; fine-tuning starts from a pretrained checkpoint.",
        "Training a model from scratch initializes random weights and learns everything from the corpus. Fine-tuning starts from an already pretrained checkpoint and only adapts it to a narrower task. From-scratch training needs more data and compute, but fine-tuning risks inheriting the base model's biases.",
    ),
    (
        "What makes an answer easy to understand?",
        "Concise, structured answers with examples are the clearest.",
        "Clarity is measured by length and structure. Answers that are too short lack detail, while answers over a few hundred words lose focus. Structured answers that use short paragraphs or bullet lists score higher. A good answer states the main point first and adds detail only where it helps.",
    ),
    (
        "How do I keep provider costs predictable?",
        "Round-robin keys and retries keep costs stable per query.",
        "Provider costs stay predictable because each query runs a fixed number of parallel bot calls and a single synthesis call. Multiple API keys are used in round-robin order, and retries add at most a small number of extra calls. Predictable cost is one reason the ensemble uses a bounded candidate count.",
    ),
    (
        "What happens to answers that are too short?",
        "Very short answers get a lower clarity score.",
        "Answers shorter than a few sentences often lack detail, so the clarity score gives them partial credit. A focused one-line answer can still win if it is strongly supported and balanced, but a moderately detailed answer usually scores higher. The ensemble favors answers that state the main point and then support it.",
    ),
    (
        "How are API keys protected in this platform?",
        "Keys are hashed, never stored in plain text.",
        "API keys generated by the platform are stored as hashes and never as plain text. The dashboard shows the full key once at creation time, then only a masked prefix afterward. If a key is compromised, it can be revoked from the API keys page and a new one issued.",
    ),
    (
        "Why does the ensemble use multiple providers?",
        "Different providers have different strengths and failure modes.",
        "Using multiple providers reduces correlated failure. If one provider is overloaded or has a policy that blocks a question, another provider can still produce a candidate. The ensemble also scores each candidate so that a single provider's weakness does not dominate the final answer.",
    ),
    (
        "What should I do if an answer contains sensitive data?",
        "The system redacts patterns like emails and keys.",
        "If a candidate answer contains sensitive patterns, the synthesis step redacts them before showing the final answer. Detection covers emails, phone numbers, credit card numbers, and API key formats. Redaction is best-effort, so users should still review answers for private data.",
    ),
    (
        "Can the system answer without any local sources?",
        "It can, but the source support score is lower.",
        "When no local sources match a question, the ensemble still answers using the providers' knowledge, but the source support score is capped lower. The system flags which parts are uncertain and encourages answers to present tradeoffs. Adding relevant files to knowledge_sources/ improves grounding over time.",
    ),
    (
        "What is the role of the synthesis step?",
        "It merges the top candidates into one final answer.",
        "After candidates are scored and ranked, a synthesis step merges the top few into a single answer. The judge keeps claims that have source support, preserves balanced framing, and explains conflicts between candidates. The result is one practical, unbiased answer instead of several partial ones.",
    ),
    (
        "How often should I retrain a custom model?",
        "Retrain when your data or your answer style changes.",
        "Custom models should be retrained when the underlying corpus changes meaningfully or when the desired answer style shifts. Frequent retraining costs compute, while rare retraining can leave the model stale. A sensible cadence is to retrain after major data updates and validate on a held-out set.",
    ),
    (
        "What makes a source chunk easy to retrieve?",
        "Chunks with clear, self-contained wording match best.",
        "Source retrieval splits files into paragraphs of roughly 850 characters and scores them by token overlap with the question. Chunks that are self-contained and use consistent vocabulary are easier to match. Breaking long documents into focused sections improves retrieval accuracy.",
    ),
    (
        "Does running locally reduce emissions?",
        "Local inference avoids remote data-center overhead.",
        "Running a small model locally avoids sending prompts to remote data centers, which can lower the estimated carbon footprint per query. The sustainability layer tracks this as one metric among several. Local models are smaller, so they trade some quality for lower cost and better privacy.",
    ),
]

# Uncertainty / tradeoff phrases that are spliced into answers.
UNCERTAINTY_MARKERS = [
    "This is supported by the available sources.",
    "Some of this depends on the exact dataset used, so treat it as approximate.",
    "The evidence here is limited, so this should be read as uncertain.",
    "Both interpretations have merit, and the right choice depends on context.",
    "The sources support the core claim, though edge cases may vary.",
]

TRADEOFF_PAIRS = [
    ("cost", "latency", "cheaper models add latency, faster models cost more"),
    ("accuracy", "privacy", "richer context improves accuracy but can expose identifiers"),
    ("speed", "thoroughness", "a quick answer is useful, a thorough one is safer"),
    ("scope", "depth", "broad answers are shallow, deep answers are narrow"),
]

ABSOLUTE_WORDS = {"always", "never", "everyone", "nobody", "guaranteed", "obviously", "undeniable"}


def _grounded_answer(example: Tuple[str, str, str], source_id: str) -> str:
    question, snippet, skeleton = example
    marker = random.choice(UNCERTAINTY_MARKERS)
    tradeoff_a, tradeoff_b, tradeoff_desc = random.choice(TRADEOFF_PAIRS)
    return (
        f"{skeleton}\n\n{snippet}\n\n"
        f"[{source_id}] {snippet[:180]}\n\n"
        f"{marker}\n\nTradeoff: {tradeoff_desc}. Prefer {tradeoff_a} when {tradeoff_b} is not critical.\n"
        f"Conclusion: on balance, the sources support the practical answer above."
    )


def _biased_answer(example: Tuple[str, str, str], source_id: str) -> str:
    question, snippet, skeleton = example
    return (
        f"{skeleton} There is no doubt about this. "
        f"All evidence {random.choice(['always', 'obviously'])} agrees. "
        f"This is the only correct interpretation and everyone should follow it. "
        f"Anyone who disagrees is simply wrong. This is guaranteed."
    )


def _vague_answer(example: Tuple[str, str, str]) -> str:
    question, snippet, skeleton = example
    return (
        "I am not sure about this. It might be one thing or another. "
        "Things are complicated and it depends on many factors. "
        "I cannot really say anything definitive about it. "
        "There is no clear answer to your question."
    )


def build_lm_corpus(seed: int = 0, n_variants: int = 6) -> List[str]:
    """Return chat-style training documents in the ensemble answer style."""
    rng = random.Random(seed)
    docs: List[str] = []
    for round_num in range(n_variants):
        for idx, example in enumerate(DOMAIN_EXAMPLES):
            question, snippet, _ = example
            persona_name, persona_instruction = PERSONAS[idx % len(PERSONAS)]
            source_id = f"S{idx + 1}"
            body = _grounded_answer(example, source_id)

            user_turn = (
                f"User request:\n{question}\n\n"
                f"Local sources:\n[{source_id}] {snippet[:700]}\n\n"
                f"Answer rules:\n- Use citations [S#] for factual statements when possible.\n"
                f"- If a fact is unsupported, label it as uncertain.\n"
                f"- Avoid one-sided framing. Present tradeoffs.\n"
                f"- Do not reveal sensitive identifiers.\n"
            )
            bot_turn = (
                f"Persona: {persona_name}. {persona_instruction}\n"
                f"Keep final answer practical and concise.\n"
                f"Bot answer:\n{body}"
            )
            doc = f"<|user|>\n{user_turn}\n<|assistant|>\n{bot_turn}\n<|end|>\n"
            docs.append(doc)
    rng.shuffle(docs)
    return docs


def build_scorer_examples(seed: int = 1) -> List[Tuple[str, float, float, float]]:
    """Return (answer, source_support, bias_score, clarity_score) labeled rows.

    Labels are constructed from known text features:
      - grounded answers carry [S#] citations + source overlap  -> high source support
      - biased answers use absolute words                      -> low bias score
      - vague answers lack structure/support                   -> low source + low clarity
    """
    rng = random.Random(seed)
    rows: List[Tuple[str, float, float, float]] = []

    for idx, example in enumerate(DOMAIN_EXAMPLES):
        source_id = f"S{idx + 1}"
        grounded = _grounded_answer(example, source_id)
        rows.append((grounded, 0.82, 0.78, 0.85))

        biased = _biased_answer(example, source_id)
        rows.append((biased, 0.4, 0.18, 0.55))

        vague = _vague_answer(example)
        rows.append((vague, 0.2, 0.5, 0.45))

        # Short focused answer -> high clarity, decent support
        short = f"According to [{source_id}], {example[1]}"
        rows.append((short, 0.65, 0.8, 0.72))

        # Long rambling -> low clarity
        long = ("In conclusion I would like to say that " + grounded + " " + grounded)[:600]
        rows.append((long, 0.7, 0.72, 0.5))

    rng.shuffle(rows)
    return rows


def write_corpus_json(path: Path, docs: List[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(docs, indent=1, ensure_ascii=False), encoding="utf-8")


def write_scorer_json(path: Path, rows: List[Tuple[str, float, float, float]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [
        {"text": text, "source_support": a, "bias_score": b, "clarity_score": c}
        for text, a, b, c in rows
    ]
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    out_dir = Path(__file__).resolve().parent / "data"
    docs = build_lm_corpus()
    write_corpus_json(out_dir / "corpus.json", docs)
    rows = build_scorer_examples()
    write_scorer_json(out_dir / "scorer_labels.json", rows)
    n_tokens = sum(len(d.split()) for d in docs)
    print(f"corpus: {len(docs)} docs, ~{n_tokens} words")
    print(f"scorer: {len(rows)} labeled examples")
