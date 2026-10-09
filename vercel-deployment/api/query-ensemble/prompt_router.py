# VENDORED COPY -- kept in sync manually with the repo-root prompt_router.py.
# See ai_client.py in this same directory for why.
"""Per-query model routing (Feature 1).

Classifies an incoming prompt into a coarse category with a lightweight
keyword/heuristic classifier (no trained model needed) and recommends a
subset of providers + bot personas for that category, so the ensemble
doesn't fan out to every provider on every query. Falls back to "use
everything" whenever classification is ambiguous or low-confidence -- a
missed optimization is cheap, a wrong one silently narrows answer quality.

Deliberately standalone (no import of ai_client.py): it works against
duck-typed providers (anything with a `.name`) and caller-supplied
(name, instruction) persona tuples, the same "thin module, plain data in/out"
shape as token_optimizer.py. This keeps ai_client.py as the single source of
truth for what a provider/persona actually is, and keeps this module unit
testable without constructing real providers.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Sequence, Tuple

# Keyword -> category. Order doesn't matter; categories are scored
# independently and the highest-hit-count category wins (ties -> ambiguous).
# Tune freely -- this is the only place category detection logic lives.
CATEGORY_KEYWORDS: Dict[str, Tuple[str, ...]] = {
    "code": (
        "code",
        "function",
        "bug",
        "debug",
        "compile",
        "exception",
        "stack trace",
        "traceback",
        "refactor",
        "regex",
        "python",
        "javascript",
        "typescript",
        "sql query",
        "algorithm",
        "syntax",
        "api endpoint",
        "unit test",
        "compiler error",
    ),
    "math": (
        "calculate",
        "equation",
        "solve for",
        "derivative",
        "integral",
        "proof",
        "theorem",
        "probability",
        "statistics",
        "how many",
        "sum of",
        "percentage",
        "arithmetic",
        "geometry",
    ),
    "creative": (
        "write a story",
        "write a poem",
        "poem about",
        "short story",
        "creative writing",
        "fictional",
        "screenplay",
        "lyrics",
        "write a song",
        "write a scene",
        "imagine a world",
    ),
    "factual": (
        "what is",
        "who is",
        "when did",
        "where is",
        "define",
        "how does",
        "explain",
        "history of",
        "capital of",
        "difference between",
    ),
    "opinion": (
        "do you think",
        "your opinion",
        "which is better",
        "should i",
        "is it worth",
        "pros and cons",
        "recommend",
        "better choice",
    ),
}

# Below this confidence, routing falls back to the full ensemble (every
# configured provider, the full BOT_PERSONAS rotation) rather than guessing.
MIN_ROUTING_CONFIDENCE = 0.4


@dataclass
class RoutingRule:
    # Substrings matched against provider.name (case-insensitive), in
    # preference order. A provider the caller doesn't actually have
    # configured is simply skipped -- this never shrinks the pool to zero.
    provider_priority: Tuple[str, ...]
    # BOT_PERSONAS names this category prefers, in preference order.
    personas: Tuple[str, ...]
    # Upper bound on how many bots this category fans out to.
    max_bots: int


# The one place category -> (providers, personas, fan-out size) is defined.
# Easy to retune without touching any orchestration logic below.
ROUTING_RULES: Dict[str, RoutingRule] = {
    "code": RoutingRule(
        provider_priority=("Groq", "OpenAI", "OpenRouter", "Local TinyGPT"),
        # Persona-only, per the brief ("the Skeptical Reviewer persona
        # only") -- but max_bots=2, not 1: a single bot call has zero
        # redundancy, so one provider hiccup (an empty/malformed response,
        # a timeout) fails the whole query instead of just losing a
        # candidate. _cycle_personas repeats "Skeptical Reviewer" against a
        # second code-capable provider when one is configured, which is
        # still a big cut from the full ~4-5 bot ensemble.
        personas=("Skeptical Reviewer",),
        max_bots=2,
    ),
    "math": RoutingRule(
        provider_priority=("OpenAI", "OpenRouter", "Groq"),
        personas=("Skeptical Reviewer", "Factual Analyst"),
        max_bots=2,
    ),
    "creative": RoutingRule(
        provider_priority=("Google Gemini", "Mistral"),
        personas=("Neutral Teacher", "Counter-Bias Bot"),
        max_bots=2,
    ),
    "factual": RoutingRule(
        provider_priority=("OpenAI", "Google Gemini", "Mistral", "OpenRouter", "Groq", "Local TinyGPT"),
        personas=("Factual Analyst", "Risk Auditor", "Neutral Teacher"),
        max_bots=3,
    ),
    "opinion": RoutingRule(
        provider_priority=("Google Gemini", "Mistral", "OpenAI"),
        personas=("Counter-Bias Bot", "Skeptical Reviewer"),
        max_bots=2,
    ),
}


@dataclass
class ClassificationResult:
    category: str
    confidence: float
    matched_keywords: List[str] = field(default_factory=list)


def classify_prompt(prompt: str) -> ClassificationResult:
    """Rule-based category guess. One keyword hit is enough to clear
    MIN_ROUTING_CONFIDENCE (0.4); each additional hit raises confidence,
    capped at 1.0. A tie between two categories' hit counts is treated as
    ambiguous ("general") rather than picking one arbitrarily."""
    text = (prompt or "").lower()
    if not text.strip():
        return ClassificationResult("general", 0.0, [])

    hits: Dict[str, List[str]] = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        matched = [kw for kw in keywords if kw in text]
        if matched:
            hits[category] = matched

    if not hits:
        return ClassificationResult("general", 0.0, [])

    ranked = sorted(hits.items(), key=lambda kv: len(kv[1]), reverse=True)
    top_category, top_matches = ranked[0]
    if len(ranked) > 1 and len(ranked[1][1]) == len(top_matches):
        return ClassificationResult("general", 0.0, [])

    confidence = min(1.0, 0.4 + 0.2 * (len(top_matches) - 1))
    return ClassificationResult(top_category, round(confidence, 3), top_matches)


def _cycle_personas(personas: Sequence[Tuple[str, str]], count: int) -> List[Tuple[str, str]]:
    if not personas or count <= 0:
        return []
    configs: List[Tuple[str, str]] = []
    idx = 0
    while len(configs) < count:
        name, instruction = personas[idx % len(personas)]
        suffix = "" if idx < len(personas) else f" #{idx + 1}"
        configs.append((name + suffix, instruction))
        idx += 1
    return configs


@dataclass
class RoutingDecision:
    category: str
    confidence: float
    providers: List[Any]
    bot_configs: List[Tuple[str, str]]
    routed: bool
    matched_keywords: List[str] = field(default_factory=list)


def route_prompt(
    prompt: str,
    providers: Sequence[Any],
    personas: Sequence[Tuple[str, str]],
    requested_bot_count: int,
) -> RoutingDecision:
    """Decide which providers/personas should actually handle this prompt.

    `providers` is the full pool the caller has configured (real
    ChatProvider instances or anything duck-typed with `.name`). `personas`
    is the full BOT_PERSONAS list to choose a subset from (not yet trimmed
    to any bot_count). Returns the original `providers`/a full-size persona
    rotation unchanged (`routed=False`) whenever classification confidence
    is below MIN_ROUTING_CONFIDENCE -- callers should treat that exactly
    like the pre-routing "call everything" behavior.
    """
    result = classify_prompt(prompt)
    rule = ROUTING_RULES.get(result.category)

    if rule is None or result.confidence < MIN_ROUTING_CONFIDENCE:
        return RoutingDecision(
            category=result.category,
            confidence=result.confidence,
            providers=list(providers),
            bot_configs=_cycle_personas(list(personas), requested_bot_count),
            routed=False,
            matched_keywords=result.matched_keywords,
        )

    def _priority_rank(provider: Any) -> int:
        name = getattr(provider, "name", "").lower()
        for rank, fragment in enumerate(rule.provider_priority):
            if fragment.lower() in name:
                return rank
        return len(rule.provider_priority)

    # Sorted by the rule's own preference order, not by whatever order
    # build_provider_stack happened to build them in (which always puts the
    # local provider first) -- otherwise "prefer provider X for this
    # category" would be silently ignored whenever X isn't first in the pool.
    chosen_providers = sorted(
        (
            p
            for p in providers
            if any(fragment.lower() in getattr(p, "name", "").lower() for fragment in rule.provider_priority)
        ),
        key=_priority_rank,
    )
    if not chosen_providers:
        # None of the recommended providers are actually configured for this
        # caller -- fall back to whatever IS configured rather than running
        # zero bots.
        chosen_providers = list(providers)

    persona_lookup = {name: (name, instruction) for name, instruction in personas}
    chosen_personas = [persona_lookup[name] for name in rule.personas if name in persona_lookup]
    if not chosen_personas:
        chosen_personas = list(personas)

    # No len(chosen_personas) cap here: _cycle_personas intentionally repeats
    # (with a "#2"-style suffix) when max_bots exceeds how many distinct
    # personas this category prefers -- that's what gives a single-persona
    # category like "code" a second, redundant bot call against a different
    # provider instead of being stuck at exactly one.
    effective_count = max(1, min(requested_bot_count, rule.max_bots))

    return RoutingDecision(
        category=result.category,
        confidence=result.confidence,
        providers=chosen_providers,
        bot_configs=_cycle_personas(chosen_personas, effective_count),
        routed=True,
        matched_keywords=result.matched_keywords,
    )
