"""Token-usage optimizer for the ensemble's provider-facing context.

Inspired by rtk (github.com/rtk-ai/rtk), which compresses command output
before an AI coding agent reads it and reports the percentage saved. This
module applies the same idea to a different surface: the retrieved source
chunks and chat history that get sent to every remote provider on every bot
call. No code from rtk is used here -- it's a Rust CLI that intercepts shell
commands, unrelated in language and domain -- this is an original
implementation of the same "compress it, then report the savings" pattern
against this project's own bottleneck.

Kept as its own module (not folded into ai_client.py) so the ensemble file
stays a thin caller: `optimize_context(...)` in, an `OptimizedContext` out.
"""
from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Dict, List, Sequence


def estimate_tokens(text: str) -> int:
    """Cheap token estimate (~4 chars/token), no tokenizer dependency.

    This is approximate by design -- good enough to compare before/after
    savings for the same text, not meant to match any specific provider's
    exact tokenizer.
    """
    if not text:
        return 0
    return max(1, len(text) // 4)


@dataclass
class TokenSavingsReport:
    original_tokens: int
    optimized_tokens: int

    @property
    def saved_tokens(self) -> int:
        return max(0, self.original_tokens - self.optimized_tokens)

    @property
    def saved_pct(self) -> float:
        if self.original_tokens <= 0:
            return 0.0
        return round(100.0 * self.saved_tokens / self.original_tokens, 1)

    def __add__(self, other: "TokenSavingsReport") -> "TokenSavingsReport":
        return TokenSavingsReport(
            self.original_tokens + other.original_tokens,
            self.optimized_tokens + other.optimized_tokens,
        )

    def as_dict(self) -> Dict[str, float]:
        return {
            "tokens_before": self.original_tokens,
            "tokens_after": self.optimized_tokens,
            "tokens_saved": self.saved_tokens,
            "tokens_saved_pct": self.saved_pct,
        }


def compress_source_chunk_text(text: str, max_chars: int = 350) -> str:
    """Bound a source chunk's length, preferring a sentence boundary.

    A hard mid-word cut makes a citation read as a dangling fragment; cutting
    at the nearest ". " keeps it a complete claim when that boundary falls in
    a reasonable range (past half the budget), otherwise falls back to a
    hard cut so a single run-on sentence can't blow the budget entirely.
    """
    text = (text or "").strip()
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    last_period = truncated.rfind(". ")
    if last_period > max_chars * 0.5:
        truncated = truncated[: last_period + 1]
    return truncated.rstrip() + " [...]"


def optimize_sources(sources: Sequence, max_chars_per_source: int = 350) -> tuple[List, TokenSavingsReport]:
    """Bound every retrieved source chunk to a per-source character budget.

    Returns shallow copies -- callers must not assume identity with the
    input sequence, since `.text` is replaced on the copy.
    """
    original_text = "\n".join(getattr(s, "text", "") or "" for s in sources)
    optimized = []
    for s in sources:
        s_copy = copy.copy(s)
        s_copy.text = compress_source_chunk_text(getattr(s, "text", ""), max_chars_per_source)
        optimized.append(s_copy)
    optimized_text = "\n".join(s.text for s in optimized)
    report = TokenSavingsReport(estimate_tokens(original_text), estimate_tokens(optimized_text))
    return optimized, report


def optimize_history(
    history: Sequence[Dict[str, str]],
    max_messages: int = 6,
    max_chars_per_message: int = 500,
) -> tuple[List[Dict[str, str]], TokenSavingsReport]:
    """Keep only the most recent turns, each bounded in length.

    Deliberately simple (slice + truncate, no extra model call) so this
    step never adds latency or cost of its own -- it must always be a net
    win, on every query, with zero risk of becoming the expensive part.
    """
    original_text = "\n".join(m.get("content", "") or "" for m in history)
    trimmed = list(history[-max_messages:]) if max_messages > 0 else []
    bounded: List[Dict[str, str]] = []
    for m in trimmed:
        content = m.get("content", "") or ""
        if len(content) > max_chars_per_message:
            content = content[:max_chars_per_message].rstrip() + " [...]"
        bounded.append({**m, "content": content})
    optimized_text = "\n".join(m.get("content", "") or "" for m in bounded)
    report = TokenSavingsReport(estimate_tokens(original_text), estimate_tokens(optimized_text))
    return bounded, report


@dataclass
class OptimizedContext:
    sources: List
    history: List[Dict[str, str]]
    savings: TokenSavingsReport


def optimize_context(
    sources: Sequence,
    history: Sequence[Dict[str, str]],
    *,
    max_chars_per_source: int = 350,
    max_history_messages: int = 6,
    max_chars_per_message: int = 500,
) -> OptimizedContext:
    """Single entry point: bound sources + history, report combined savings.

    Applied once per query in build_ensemble_answer (not once per bot), so
    the saving is multiplied by bot_count in practice -- every parallel bot
    call reuses the same trimmed context instead of re-sending the full one.
    """
    opt_sources, source_report = optimize_sources(sources, max_chars_per_source)
    opt_history, history_report = optimize_history(history, max_history_messages, max_chars_per_message)
    return OptimizedContext(
        sources=opt_sources,
        history=opt_history,
        savings=source_report + history_report,
    )
