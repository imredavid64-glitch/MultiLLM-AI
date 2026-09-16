"""Offline Multi-LLM ensemble demo.

Runs the full ensemble architecture using ONLY the locally trained models
(TinyGPT generator + TinyScorer) — no API keys or network required.

Usage:
  python3 ensemble_demo.py "Your question here"
  python3 ensemble_demo.py --sources --top-k 3 "How does an ensemble improve quality?"
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

from ai_client import (
    GenerationConfig,
    SourceIndex,
    bias_score,
    clarity_score,
    detect_sensitive_hits,
    format_sources_for_prompt,
    format_sources_for_user,
    generate_candidate,
    redact_sensitive,
    source_support_score,
)
from local_models import LocalTransformerProvider

BASE_DIR = Path(__file__).resolve().parent
SOURCES_DIR = BASE_DIR / "knowledge_sources"


def run_ensemble(query: str, top_k: int, show_sources: bool) -> None:
    start = time.time()

    index = SourceIndex(SOURCES_DIR)
    index.refresh()
    sources = index.retrieve(query, top_k=top_k)
    source_context = format_sources_for_prompt(sources)

    print(f"Question: {query}")
    print(f"Local model: LocalTransformerProvider (TinyGPT, from scratch)")
    print(f"Sources: {len(sources)} retrieved from knowledge_sources/")
    print("-" * 64)

    # Two personas act as the parallel "bots", both offline.
    provider = LocalTransformerProvider()
    personas = [
        ("Factual Analyst", "Prioritize precise facts and explicit assumptions."),
        ("Neutral Teacher", "Explain clearly for non-experts with minimal jargon."),
    ]

    candidates = []
    for bot_name, instruction in personas:
        text = generate_candidate(
            provider,
            history=[],
            user_input=query,
            source_context=source_context,
            bot_name=bot_name,
            bot_instruction=instruction,
            privacy_redaction=True,
            gen_p=GenerationConfig(temperature=0.8),
        )
        s = source_support_score(text, sources)
        b = bias_score(text)
        c = clarity_score(text)
        try:
            from local_models import blend_score

            s, b, c = blend_score(text, sources, s, b, c)
        except Exception:
            pass
        total = 0.50 * s + 0.25 * b + 0.25 * c
        candidates.append((bot_name, text, s, b, c, total))

    candidates.sort(key=lambda x: x[5], reverse=True)
    for bot_name, text, s, b, c, total in candidates:
        print(f"\n[{bot_name}] score={total:.2f} (support={s:.2f}, bias={b:.2f}, clarity={c:.2f})")
        print(text[:500])
        print("-" * 64)

    winner = candidates[0]
    print(f"\nSelected answer ({winner[0]}):")
    print(winner[1])
    if detect_sensitive_hits(winner[1]):
        print("\n(leakage scan: sensitive patterns REDACTED)")
    else:
        print("\n(leakage scan: OK)")

    if show_sources:
        print("\nSource checks:")
        print(format_sources_for_user(sources))

    print(f"\nElapsed: {time.time() - start:.2f}s (fully offline)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Offline Multi-LLM ensemble demo")
    parser.add_argument("query", nargs="?", default="How does a multi-LLM ensemble improve answer quality?")
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--sources", action="store_true", help="Show retrieved sources")
    args = parser.parse_args()
    run_ensemble(args.query, args.top_k, args.sources)


if __name__ == "__main__":
    main()
