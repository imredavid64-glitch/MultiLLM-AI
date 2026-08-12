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
    (
        "How does the ensemble handle conflicting answers from different models?",
        "The synthesis step identifies and resolves conflicts between candidates.",
        "When candidates disagree, the synthesis step compares their claims against source support. Conflicts are noted explicitly in the final answer, with the most well-supported perspective given priority. The judge also looks for common ground and presents balanced tradeoffs where models have different but valid viewpoints.",
    ),
    (
        "What types of questions work best with this ensemble?",
        "Fact-based questions with local sources get the best results.",
        "Questions that can be answered from the knowledge_sources/ directory produce the highest quality answers. The ensemble also handles open-ended questions well by presenting multiple perspectives. Complex multi-part questions may need to be broken down for optimal results.",
    ),
    (
        "Can I customize the scoring weights for candidates?",
        "Yes, the scoring formula can be adjusted in the code.",
        "The default weights are 50% source support, 25% bias score, and 25% clarity score. These can be modified in the build_ensemble_answer function to prioritize different aspects. For example, increasing source support weight makes answers more conservative and fact-based.",
    ),
    (
        "What happens during the synthesis step if candidates are very different?",
        "The judge extracts and combines the best parts from each candidate.",
        "The synthesis step evaluates each candidate's contributions independently. It keeps claims that have strong source support, preserves balanced framing, and explains where candidates disagreed. The final answer is a coherent whole rather than a patchwork, with citations maintained for traceability.",
    ),
    (
        "How does the system prevent leaking sensitive information?",
        "Redaction happens before any API call, not after.",
        "Privacy redaction scans the prompt and all previous messages for sensitive patterns before they are sent to any remote API. This means secrets never leave the local environment. The redaction uses regex patterns for common sensitive data types and replaces matches with [REDACTED] markers.",
    ),
    (
        "What is the purpose of the persona system?",
        "Personas encourage diverse perspectives in candidate answers.",
        "Each bot adopts a specific persona like Factual Analyst, Skeptical Reviewer, or Neutral Teacher. This encourages the ensemble to generate answers from different angles. The persona instructions guide the model to focus on particular aspects, which are then balanced during synthesis.",
    ),
    (
        "How are long documents handled in knowledge_sources?",
        "They are split into chunks for retrieval.",
        "Long documents are automatically split into paragraphs of roughly 850 characters each. Each chunk is indexed separately and can be retrieved independently. This allows the system to find relevant passages from long documents without being overwhelmed by irrelevant content.",
    ),
    (
        "What metrics does the system track for each query?",
        "Source support, bias score, clarity score, and total score.",
        "Each candidate answer is evaluated on three dimensions: source support measures factual grounding, bias score measures balanced framing, and clarity score measures readability. These are combined into a total score for ranking. The final answer also receives these scores for transparency.",
    ),
    (
        "How does the system handle ambiguous questions?",
        "Ambiguous prompts are flagged and answered with explicit assumptions.",
        "When a question can be read several ways, the ensemble states the assumption it uses and answers under that reading. It also notes the alternative interpretation so the user can re-ask. This reduces the chance of answering a different question than the one intended.",
    ),
    (
        "What are the limits of the tiny local models?",
        "They are small, fast, and offline, but answer depth is limited.",
        "The local TinyGPT generator runs fully offline with no API cost, but its small size means it produces concise, style-consistent answers rather than deep expertise. It works best as one candidate in the ensemble and as a privacy-preserving fallback. Larger remote models can add depth when available.",
    ),
    (
        "How do multiple API keys get used?",
        "Keys are rotated in round-robin order to spread rate limits.",
        "If a provider has several keys configured, the ensemble uses them in round-robin order. This spreads usage across keys and reduces the chance of hitting a per-key rate limit. A single exhausted key does not stop the ensemble because the next key is tried automatically.",
    ),
    (
        "How is chat history handled between turns?",
        "Recent messages are kept in context, older ones are summarized.",
        "The ensemble keeps recent turns in the active context and summarizes older ones to control token usage. Long histories are trimmed so the prompt stays within provider limits. Redaction runs on the full message history, not just the latest message.",
    ),
    (
        "How does the ensemble choose which persona to use?",
        "Personas are assigned to parallel bots to diversify answers.",
        "Each parallel bot is given a distinct persona, such as Factual Analyst or Risk Auditor, so the same question is answered from different angles. The personas are assigned round-robin across bots. This diversity is one reason the ensemble can catch blind spots that a single perspective would miss.",
    ),
    (
        "How does retrieval decide which source chunks are relevant?",
        "Chunks are scored by BM25 against the question tokens.",
        "When a question arrives, the source index tokenizes it and scores every chunk with BM25, a ranking function that balances term frequency against how common each term is across the corpus. The highest-scoring chunks are returned as sources. Because BM25 uses token overlap, rephrasing a question changes which chunks match, so well-worded questions retrieve better evidence.",
    ),
    (
        "What generation parameters control the bot output?",
        "Temperature, top_p, top_k, and repetition penalty shape each answer.",
        "Each bot call accepts generation settings: temperature controls how random sampling is, top_p and top_k trim the candidate token set, and the repetition penalty discourages repeated phrases. Lower temperatures give more conservative, predictable answers while higher temperatures explore more. These settings are per-provider, so the ensemble can tune each bot independently.",
    ),
    (
        "What happens if every provider fails at once?",
        "The query returns an error unless a local fallback exists.",
        "Each provider call is retried with backoff, and failed bots are excluded from ranking. If every configured provider is unavailable, the ensemble falls back to the local model when enabled, otherwise it returns a clear error. This total-failure case is rare because multiple providers and keys are tried first.",
    ),
    (
        "What file formats are supported as knowledge sources?",
        "Text-based formats like .txt, .md, and .csv are indexed.",
        "The knowledge base indexes text-based files: plain text, Markdown, and CSV are read directly and split into chunks. Binary formats like PDFs or images are not parsed. Keeping sources in simple text formats makes retrieval fast and predictable, at the cost of not supporting rich document types.",
    ),
    (
        "How does the ensemble keep answers concise?",
        "A clarity score penalizes answers that are too short or too long.",
        "The clarity score rewards answers between roughly 35 and 280 words that use short paragraphs or bullet lists. Very short answers lack detail and score lower, while rambling answers lose focus and also score lower. The ensemble therefore tends to select candidates that state the main point first and keep supporting detail tight.",
    ),
]

# Paraphrases for each question (aligned with DOMAIN_EXAMPLES by index). The
# generator sees each concept asked many different ways, which forces it to
# learn the underlying meaning instead of memorizing exact question strings.
QUESTION_PARAPHRASES: List[List[str]] = [
    [
        "How does a multi-LLM ensemble improve answer quality?",
        "In what way does combining multiple models make answers better?",
        "Why is an ensemble of LLMs higher quality than a single model?",
    ],
    [
        "Is local knowledge grounding useful for chat assistants?",
        "Does grounding answers in local files help a chatbot?",
        "What benefit do local sources give a chat assistant?",
    ],
    [
        "Why is bias reduction important in AI answers?",
        "Why does balanced framing matter in model responses?",
        "How does presenting both sides reduce misleading answers?",
    ],
    [
        "What is privacy redaction in this system?",
        "How does the system hide sensitive data before calling APIs?",
        "What happens to private information in prompts and replies?",
    ],
    [
        "How are the candidate answers ranked?",
        "What determines which candidate answer wins?",
        "How are generated answers ordered by quality?",
    ],
    [
        "Can I add my own documents to the system?",
        "How do I load my own files as sources?",
        "Is it possible to index my own text files for answers?",
    ],
    [
        "Does the platform use renewable energy?",
        "Is the service powered by green energy?",
        "How does the platform track its carbon footprint?",
    ],
    [
        "What happens if one provider fails during a query?",
        "How are provider outages handled at runtime?",
        "What occurs when a model call errors out?",
    ],
    [
        "How do citations work in generated answers?",
        "How are source references marked in replies?",
        "What do the [S1], [S2] markers mean in answers?",
    ],
    [
        "What is the difference between training and fine-tuning?",
        "How does training from scratch differ from fine-tuning?",
        "Which approach needs more data, training or fine-tuning?",
    ],
    [
        "What makes an answer easy to understand?",
        "How is answer clarity measured?",
        "What structure makes a response most readable?",
    ],
    [
        "How do I keep provider costs predictable?",
        "What keeps API costs stable per question?",
        "How are provider bills kept under control?",
    ],
    [
        "What happens to answers that are too short?",
        "How are brief responses scored?",
        "Why do very short answers lose points on clarity?",
    ],
    [
        "How are API keys protected in this platform?",
        "Are API keys stored securely?",
        "How are user credentials kept safe?",
    ],
    [
        "Why does the ensemble use multiple providers?",
        "Why not rely on a single model provider?",
        "What is the benefit of several API providers?",
    ],
    [
        "What should I do if an answer contains sensitive data?",
        "How is private data removed from responses?",
        "What happens when a reply leaks an identifier?",
    ],
    [
        "Can the system answer without any local sources?",
        "How does the system respond with no sources retrieved?",
        "What happens when no local files match the question?",
    ],
    [
        "What is the role of the synthesis step?",
        "What does the judge do after candidates are ranked?",
        "How are the top answers merged into one?",
    ],
    [
        "How often should I retrain a custom model?",
        "When is it time to retrain the models?",
        "What cadence is recommended for retraining?",
    ],
    [
        "What makes a source chunk easy to retrieve?",
        "How are source paragraphs indexed and matched?",
        "What improves retrieval accuracy for a source file?",
    ],
    [
        "Does running locally reduce emissions?",
        "Is local inference greener than cloud APIs?",
        "How does on-device processing affect carbon usage?",
    ],
    [
        "How does the ensemble handle conflicting answers from different models?",
        "What happens when candidates disagree with each other?",
        "How are contradictory model responses resolved?",
    ],
    [
        "What types of questions work best with this ensemble?",
        "Which kinds of queries give the best results?",
        "What should I ask to get the most accurate answers?",
    ],
    [
        "Can I customize the scoring weights for candidates?",
        "Is the scoring formula adjustable?",
        "How do I tune how answers are ranked?",
    ],
    [
        "What happens during the synthesis step if candidates are very different?",
        "How does the judge handle wildly different answers?",
        "What if no two candidates agree on much?",
    ],
    [
        "How does the system prevent leaking sensitive information?",
        "How is data protected before it reaches a provider?",
        "What prevents secrets from being sent to APIs?",
    ],
    [
        "What is the purpose of the persona system?",
        "Why do the bots use different personas?",
        "What do the multiple personalities add to the ensemble?",
    ],
    [
        "How are long documents handled in knowledge_sources?",
        "How are large files processed for retrieval?",
        "What happens to a big document in the source index?",
    ],
    [
        "What metrics does the system track for each query?",
        "Which scores are computed for every answer?",
        "How is each response evaluated?",
    ],
    [
        "How does the system handle ambiguous questions?",
        "What happens when a question can be read multiple ways?",
        "How are unclear prompts answered?",
    ],
    [
        "What are the limits of the tiny local models?",
        "How capable are the offline local models?",
        "What can the small local generator not do well?",
    ],
    [
        "How do multiple API keys get used?",
        "How are several provider keys managed?",
        "What happens when one API key runs out of quota?",
    ],
    [
        "How is chat history handled between turns?",
        "How much conversation context is kept?",
        "What happens to old messages in a long chat?",
    ],
    [
        "How does the ensemble choose which persona to use?",
        "How are the bot personalities assigned?",
        "Why do different bots use different instructions?",
    ],
    [
        "How does retrieval decide which source chunks are relevant?",
        "How are source paragraphs selected for a question?",
        "What ranking decides which chunks are retrieved?",
    ],
    [
        "What generation parameters control the bot output?",
        "Which sampling settings shape each answer?",
        "How does temperature affect generated responses?",
    ],
    [
        "What happens if every provider fails at once?",
        "What occurs when no provider can answer a query?",
        "How is a total provider outage handled?",
    ],
    [
        "What file formats are supported as knowledge sources?",
        "Which document types can the index read?",
        "Are PDF or Markdown files supported as sources?",
    ],
    [
        "How does the ensemble keep answers concise?",
        "Why do short and rambling answers score lower?",
        "How is conciseness rewarded in scoring?",
    ],
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
    citation = f"[{source_id}] {snippet[:180]}"
    detail = snippet[:300]
    key_point = f"- {detail}"
    close = random.choice(
        [
            "Conclusion: on balance, the sources support the practical answer above.",
            "In short: the supported answer is the safe default, with the tradeoff noted above kept in mind.",
        ]
    )
    if random.random() < 0.4:
        # Copy-and-cite: answer paraphrases the source snippet almost verbatim
        # and cites it, which teaches the generator to ground on retrieved text.
        return (
            f"According to [{source_id}], {detail}. "
            f"{marker} The practical upshot is that {detail.lower()[:60]}... "
            f"Key points:\n{key_point}\n\n"
            f"Tradeoff: {tradeoff_desc}. Prefer {tradeoff_a} when {tradeoff_b} is not critical.\n"
            f"{close}"
        )
    if random.random() < 0.5:
        return (
            f"{skeleton}\n\n{detail}\n\n"
            f"Key points:\n{key_point}\n\n"
            f"{citation}\n\n"
            f"{marker}\n\nTradeoff: {tradeoff_desc}. Prefer {tradeoff_a} when {tradeoff_b} is not critical.\n"
            f"{close}"
        )
    if random.random() < 0.5:
        # Structured: use clear section headers for a well-organized answer.
        return (
            f"Summary: {skeleton}\n\n"
            f"Details: {detail}\n\n"
            f"Key points:\n{key_point}\n\n"
            f"Tradeoff: {tradeoff_desc}. Prefer {tradeoff_a} when {tradeoff_b} is not critical.\n\n"
            f"{citation}\n\n"
            f"{marker}\n{close}"
        )
    # Reordered variant: lead with the tradeoff, then claim + citation + key points.
    return (
        f"Tradeoff: {tradeoff_desc}. Prefer {tradeoff_a} when {tradeoff_b} is not critical.\n\n"
        f"{skeleton}\n\n{citation}\n\n"
        f"Key points:\n{key_point}\n\n"
        f"{marker}\n{close}"
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


def build_lm_corpus(seed: int = 0, n_variants: int = 60) -> List[str]:
    """Return chat-style training documents in the ensemble answer style.

    Mixes the synthetic domain examples with the real knowledge_sources/ docs
    so the model learns to answer from the actual seed content it will retrieve.
    """
    rng = random.Random(seed)
    docs: List[str] = []
    for round_num in range(n_variants):
        for idx, example in enumerate(DOMAIN_EXAMPLES):
            question, snippet, _ = example
            paraphrase_set = QUESTION_PARAPHRASES[idx]
            phrased = paraphrase_set[(round_num + idx) % len(paraphrase_set)]
            persona_name, persona_instruction = PERSONAS[idx % len(PERSONAS)]
            source_id = f"S{idx + 1}"
            body = _grounded_answer(example, source_id)

            user_turn = (
                f"User request:\n{phrased}\n\n"
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

    docs.extend(_build_knowledge_docs())
    rng.shuffle(docs)
    return docs


def _build_knowledge_docs() -> List[str]:
    """Build chat-style docs grounded in the real knowledge_sources/ files.

    For every recognized .md file, one question about it is paired with the
    file's full text as the retrieved source and a grounded answer. This teaches
    the generator to answer from the exact content the RAG index retrieves.
    """
    import re

    from ai_client import chunk_text

    base = Path(__file__).resolve().parent.parent / "knowledge_sources"
    if not base.exists():
        return []

    title_re = re.compile(r"^#\s+(.+)$", re.MULTILINE)
    sections_re = re.compile(r"^##\s+(.+)$", re.MULTILINE)
    docs: List[str] = []
    for path in sorted(base.glob("*.md")):
        text = path.read_text(encoding="utf-8", errors="ignore")
        if not text.strip():
            continue
        title_match = title_re.search(text)
        title = title_match.group(1).strip() if title_match else path.stem.replace("_", " ")
        source_id = f"KS{len(docs) + 1}"
        user_turn = (
            f"User request:\nWhat does {title} say?\n\n"
            f"Local sources:\n[{source_id}] {chunk_text(text, max_chars=1800)[0]}\n\n"
            f"Answer rules:\n- Use citations [S#] for factual statements when possible.\n"
            f"- If a fact is unsupported, label it as uncertain.\n"
            f"- Avoid one-sided framing. Present tradeoffs.\n"
            f"- Do not reveal sensitive identifiers.\n"
        )
        bot_turn = (
            f"Persona: Factual Analyst. Prioritize precise facts and explicit assumptions.\n"
            f"Keep final answer practical and concise.\n"
            f"Bot answer:\n"
            f"Per [{source_id}], {title} covers the following. {text.strip()[:900]}\n\n"
            f"[{source_id}] This answer is grounded in the retrieved source. "
            f"Some details depend on the exact setup, so treat them as approximate."
        )
        docs.append(f"<|user|>\n{user_turn}\n<|assistant|>\n{bot_turn}\n<|end|>\n")
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

        # Partially grounded -> mid source support
        partial = (
            f"Most of the answer is supported by [{source_id}]. "
            f"Some claims depend on the exact setup, so treat them as approximate. "
            f"{example[1]}"
        )
        rows.append((partial, 0.68, 0.75, 0.74))

        # Biased without absolute words -> framing penalty, decent support
        framing_biased = (
            f"According to [{source_id}], this is the clearly superior approach. "
            f"There is essentially one way to look at this, and the evidence points "
            f"strongly in that direction without exception."
        )
        rows.append((framing_biased, 0.62, 0.42, 0.7))

        # Overlong rambling with citations -> mid clarity, high support
        verbose = (
            f"According to [{source_id}], the answer involves many interrelated factors "
            f"that must be carefully considered in sequence. First, consider the context "
            f"and the surrounding details. Then reflect on how each factor interacts. "
            f"After that, weigh the tradeoffs. Finally, arrive at a conclusion that takes "
            f"everything into account. {grounded}"
        )[:600]
        rows.append((verbose, 0.75, 0.74, 0.55))

        # Clear but unsupported -> low source support, high clarity
        unsupported_clear = (
            "This is a straightforward explanation of the topic. Here is what you need "
            "to know in three clear points. First point. Second point. Third point."
        )
        rows.append((unsupported_clear, 0.3, 0.68, 0.8))

        # Length-appropriate with citations -> best clarity
        cited_clean = (
            f"According to [{source_id}], {example[1]}. "
            f"This is supported by the available sources, though edge cases may vary."
        )
        rows.append((cited_clean, 0.78, 0.82, 0.82))

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
