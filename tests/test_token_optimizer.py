"""Tests for token_optimizer.py -- the context-trimming layer applied before
every provider call in ai_client.build_ensemble_answer."""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Set

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from token_optimizer import (
    TokenSavingsReport,
    compress_source_chunk_text,
    estimate_tokens,
    optimize_context,
    optimize_history,
    optimize_sources,
)


@dataclass
class FakeSourceChunk:
    source_id: str
    text: str
    tokens: Set[str] = field(default_factory=set)


def test_estimate_tokens_basic():
    assert estimate_tokens("") == 0
    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("a" * 400) == 100


def test_compress_source_chunk_text_leaves_short_text_untouched():
    short = "This is a short source chunk."
    assert compress_source_chunk_text(short, max_chars=350) == short


def test_compress_source_chunk_text_truncates_on_sentence_boundary():
    long_text = "First sentence is here. " * 40  # well past 350 chars
    out = compress_source_chunk_text(long_text, max_chars=350)
    assert len(out) <= 360
    assert out.endswith(".") or out.endswith("[...]")


def test_compress_source_chunk_text_hard_cuts_a_single_run_on_sentence():
    long_run_on = "word " * 200  # no ". " boundary at all
    out = compress_source_chunk_text(long_run_on, max_chars=100)
    assert out.endswith("[...]")
    assert len(out) <= 110


def test_optimize_sources_reduces_total_length_and_reports_savings():
    sources = [FakeSourceChunk(f"S{i}", "word " * 300) for i in range(3)]
    optimized, report = optimize_sources(sources, max_chars_per_source=100)
    assert all(len(s.text) <= 110 for s in optimized)
    assert isinstance(report, TokenSavingsReport)
    assert report.saved_tokens > 0
    assert 0 < report.saved_pct <= 100
    # Original sequence must not be mutated (shallow copies only).
    assert len(sources[0].text) > 110


def test_optimize_sources_handles_empty_list():
    optimized, report = optimize_sources([], max_chars_per_source=100)
    assert optimized == []
    assert report.original_tokens == 0
    assert report.saved_tokens == 0
    assert report.saved_pct == 0.0


def test_optimize_history_keeps_only_recent_messages():
    history = [{"role": "user", "content": f"message {i}"} for i in range(20)]
    optimized, report = optimize_history(history, max_messages=6, max_chars_per_message=500)
    assert len(optimized) == 6
    assert optimized[-1]["content"] == "message 19"
    assert report.saved_tokens >= 0


def test_optimize_history_truncates_long_messages():
    history = [{"role": "user", "content": "x" * 2000}]
    optimized, report = optimize_history(history, max_messages=6, max_chars_per_message=500)
    assert len(optimized[0]["content"]) <= 510
    assert optimized[0]["content"].endswith("[...]")
    assert report.saved_tokens > 0


def test_optimize_context_combines_source_and_history_savings():
    sources = [FakeSourceChunk("S1", "word " * 300)]
    history = [{"role": "user", "content": "x" * 2000}] * 10
    result = optimize_context(sources, history, max_chars_per_source=100, max_history_messages=4, max_chars_per_message=200)
    assert len(result.sources) == 1
    assert len(result.history) == 4
    assert result.savings.saved_tokens > 0

    as_dict = result.savings.as_dict()
    assert as_dict["tokens_saved"] == as_dict["tokens_before"] - as_dict["tokens_after"]


def test_token_savings_report_addition():
    a = TokenSavingsReport(100, 50)
    b = TokenSavingsReport(200, 150)
    combined = a + b
    assert combined.original_tokens == 300
    assert combined.optimized_tokens == 200
    assert combined.saved_tokens == 100
    assert combined.saved_pct == pytest.approx(33.3, abs=0.5)
