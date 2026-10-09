"""Tests for ai_client._iter_stream_with_timeout -- the guard around
build_ensemble_answer_stream's real token-streaming loop. Unlike every other
provider-call site (wrapped in _call_with_timeout), chat_stream() generators
are iterated directly, so a stalled connection had no bound at all until this
helper was added. These tests use fake generators instead of real providers --
no network calls."""

from __future__ import annotations

import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ai_client import _iter_stream_with_timeout


def _fast_generator():
    yield "a"
    yield "b"
    yield "c"


def test_passes_through_a_normal_fast_stream():
    assert list(_iter_stream_with_timeout(_fast_generator(), timeout_seconds=1.0)) == ["a", "b", "c"]


def _stalling_generator():
    yield "a"
    time.sleep(2.0)
    yield "b"  # never reached -- timeout fires first


def test_raises_timeout_error_when_a_chunk_stalls():
    chunks = []
    with pytest.raises(TimeoutError):
        for chunk in _iter_stream_with_timeout(_stalling_generator(), timeout_seconds=0.2):
            chunks.append(chunk)
    # The chunk that arrived before the stall must still have been yielded --
    # a stall mid-stream shouldn't discard progress already made.
    assert chunks == ["a"]


def _raising_generator():
    yield "a"
    raise RuntimeError("upstream connection reset")


def test_relays_an_exception_raised_by_the_wrapped_generator():
    chunks = []
    with pytest.raises(RuntimeError, match="upstream connection reset"):
        for chunk in _iter_stream_with_timeout(_raising_generator(), timeout_seconds=1.0):
            chunks.append(chunk)
    assert chunks == ["a"]


def test_immediate_stall_with_no_chunks_still_times_out():
    def _never_yields():
        time.sleep(2.0)
        yield "too late"

    with pytest.raises(TimeoutError):
        list(_iter_stream_with_timeout(_never_yields(), timeout_seconds=0.2))
