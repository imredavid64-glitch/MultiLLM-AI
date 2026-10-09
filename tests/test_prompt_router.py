"""Tests for prompt_router.py -- the per-query model routing layer (Feature 1)
applied in ai_client.build_ensemble_answer before fanning out bot calls."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from prompt_router import (
    MIN_ROUTING_CONFIDENCE,
    ROUTING_RULES,
    classify_prompt,
    route_prompt,
)

PERSONAS = [
    ("Factual Analyst", "a"),
    ("Skeptical Reviewer", "b"),
    ("Neutral Teacher", "c"),
    ("Risk Auditor", "d"),
    ("Counter-Bias Bot", "e"),
]


class FakeProvider:
    def __init__(self, name: str) -> None:
        self.name = name


def make_providers():
    return [
        FakeProvider("Local TinyGPT (from scratch)"),
        FakeProvider("OpenRouter (OpenAI API)"),
        FakeProvider("Google Gemini"),
        FakeProvider("Groq (OpenAI API)"),
    ]


def test_classify_prompt_detects_code():
    result = classify_prompt("Why does this python function raise an exception when I debug it?")
    assert result.category == "code"
    assert result.confidence >= MIN_ROUTING_CONFIDENCE


def test_classify_prompt_ambiguous_prompt_falls_back_to_general():
    result = classify_prompt("hello there")
    assert result.category == "general"
    assert result.confidence == 0.0


def test_classify_prompt_empty_string_is_general():
    result = classify_prompt("")
    assert result.category == "general"
    assert result.confidence == 0.0


def test_classify_prompt_tie_between_categories_is_ambiguous():
    # "explain" (factual) and "recommend" (opinion) each hit exactly once --
    # a tie should not be resolved by picking one arbitrarily.
    result = classify_prompt("explain and recommend")
    assert result.category == "general"
    assert result.confidence == 0.0


def test_route_prompt_ambiguous_uses_full_ensemble():
    providers = make_providers()
    decision = route_prompt("hello there", providers, PERSONAS, requested_bot_count=4)
    assert decision.routed is False
    assert decision.providers == providers
    assert len(decision.bot_configs) == 4


def test_route_prompt_code_prefers_groq_and_skeptical_reviewer():
    providers = make_providers()
    decision = route_prompt(
        "Help me debug this python function, it keeps raising an exception",
        providers,
        PERSONAS,
        requested_bot_count=4,
    )
    assert decision.routed is True
    assert decision.category == "code"
    # Groq ranks first in the code rule's provider_priority -- it must come
    # first in the routed subset regardless of its position in the input.
    assert decision.providers[0].name == "Groq (OpenAI API)"
    assert all("Skeptical Reviewer" in name for name, _ in decision.bot_configs)
    # max_bots=2 for code, not 1 -- a single bot call has no redundancy.
    assert len(decision.bot_configs) == 2


def test_route_prompt_narrows_bot_count_for_creative():
    providers = make_providers()
    decision = route_prompt("Write a short story about a dragon", providers, PERSONAS, requested_bot_count=5)
    assert decision.routed is True
    assert decision.category == "creative"
    assert len(decision.bot_configs) <= ROUTING_RULES["creative"].max_bots
    names = {p.name for p in decision.providers}
    assert "Google Gemini" in names
    assert "Groq (OpenAI API)" not in names


def test_route_prompt_falls_back_when_no_recommended_provider_is_configured():
    # Only a provider the "creative" rule doesn't recommend is configured.
    providers = [FakeProvider("Groq (OpenAI API)")]
    decision = route_prompt("Write a poem about autumn", providers, PERSONAS, requested_bot_count=3)
    assert decision.routed is True
    # Never narrows the pool to zero providers.
    assert decision.providers == providers


def test_route_prompt_respects_requested_bot_count_ceiling():
    providers = make_providers()
    decision = route_prompt("What is the capital of France?", providers, PERSONAS, requested_bot_count=1)
    assert decision.routed is True
    assert len(decision.bot_configs) == 1
