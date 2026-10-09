"""Tests for per-provider timeout/failure handling in ai_client.py:
classify_failure and build_ensemble_answer's partial-failure behavior (a
slow/erroring/rate-limited provider must not fail the whole query, and an
answer built only from the local fallback model when a remote provider was
available must be refused outright).

No real network calls or API keys are used anywhere in this file.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Dict, Sequence

import pytest
from openai import RateLimitError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ai_client import (
    LOCAL_PROVIDER_NAME,
    NoRemoteProviderAnsweredError,
    build_ensemble_answer,
    classify_failure,
)

# Short enough to keep this test file fast; passed explicitly via
# build_ensemble_answer's provider_timeout_seconds override rather than
# relying on the real PROVIDER_TIMEOUT_SECONDS default (>=1s).
FAST_TIMEOUT_SECONDS = 0.3


class _FakeHttpResponse:
    status_code = 429
    headers: dict = {}
    request = None


class _FakeProvider:
    """Minimal ChatProvider. `behavior` controls what chat() does:
    "ok" (instant canned reply), "slow" (sleeps past the caller's timeout),
    "error" (raises a generic error), "rate_limited" (raises RateLimitError)."""

    def __init__(self, name: str, behavior: str = "ok", reply: str = "") -> None:
        self.name = name
        self.model = "fake-model"
        self.behavior = behavior
        self._reply = reply or (
            "This is a well-supported answer [S1] that stays balanced and avoids "
            "absolute claims, presented at a reasonable, readable length overall."
        )

    def size(self) -> int:
        return 1

    def chat(self, messages: Sequence[Dict[str, str]], temperature: float, gen_p=None) -> str:
        if self.behavior == "ok":
            return self._reply
        if self.behavior == "slow":
            time.sleep(FAST_TIMEOUT_SECONDS * 5)
            return self._reply
        if self.behavior == "rate_limited":
            raise RateLimitError("rate limited", response=_FakeHttpResponse(), body=None)
        raise RuntimeError("simulated provider error: upstream said something with a secret-looking token sk-abc123")


# ---------------------------------------------------------------------------
# classify_failure
# ---------------------------------------------------------------------------


def test_classify_failure_timeout():
    assert classify_failure(TimeoutError("timed out after 1s")) == "timeout"


def test_classify_failure_rate_limited_exception_type():
    assert classify_failure(RateLimitError("nope", response=_FakeHttpResponse(), body=None)) == "rate_limited"


def test_classify_failure_rate_limited_by_message():
    assert classify_failure(RuntimeError("HTTP 429: quota exceeded")) == "rate_limited"


def test_classify_failure_generic_error():
    assert classify_failure(RuntimeError("HTTP 500: upstream exploded")) == "error"


# ---------------------------------------------------------------------------
# build_ensemble_answer: partial failures must not fail the whole query
# ---------------------------------------------------------------------------


def test_one_provider_times_out_others_still_answer():
    providers = [_FakeProvider("Slow", behavior="slow"), _FakeProvider("Fast", behavior="ok")]
    failures: list = []
    answer, candidates, _, _ = build_ensemble_answer(
        providers=providers,
        history=[],
        user_input="Anything?",
        sources=[],
        bot_count=2,
        privacy_redaction=False,
        failures_out=failures,
        provider_timeout_seconds=FAST_TIMEOUT_SECONDS,
    )
    assert isinstance(answer, str) and answer.strip()
    assert len(candidates) == 1  # only the fast one succeeded
    assert len(failures) == 1
    assert failures[0]["reason"] == "timeout"
    assert failures[0]["provider_name"] == "Slow"


def test_one_provider_errors_others_still_answer():
    providers = [_FakeProvider("Broken", behavior="error"), _FakeProvider("Fast", behavior="ok")]
    failures: list = []
    answer, candidates, _, _ = build_ensemble_answer(
        providers=providers,
        history=[],
        user_input="Anything?",
        sources=[],
        bot_count=2,
        privacy_redaction=False,
        failures_out=failures,
    )
    assert isinstance(answer, str) and answer.strip()
    assert len(candidates) == 1
    assert len(failures) == 1
    assert failures[0]["reason"] == "error"
    # The raw exception text (which could embed upstream error detail) must
    # never leak into the structured failure reason.
    assert "sk-abc123" not in failures[0]["reason"]


def test_one_provider_rate_limited_others_still_answer():
    providers = [_FakeProvider("Throttled", behavior="rate_limited"), _FakeProvider("Fast", behavior="ok")]
    failures: list = []
    answer, candidates, _, _ = build_ensemble_answer(
        providers=providers,
        history=[],
        user_input="Anything?",
        sources=[],
        bot_count=2,
        privacy_redaction=False,
        failures_out=failures,
    )
    assert isinstance(answer, str) and answer.strip()
    assert len(failures) == 1
    assert failures[0]["reason"] == "rate_limited"


def test_all_providers_fail_raises():
    providers = [_FakeProvider("Broken-A", behavior="error"), _FakeProvider("Broken-B", behavior="rate_limited")]
    failures: list = []
    with pytest.raises(RuntimeError, match="All provider calls failed"):
        build_ensemble_answer(
            providers=providers,
            history=[],
            user_input="Anything?",
            sources=[],
            bot_count=2,
            privacy_redaction=False,
            failures_out=failures,
        )
    assert len(failures) == 2
    assert {f["reason"] for f in failures} == {"error", "rate_limited"}


def test_all_providers_succeed_no_failures_recorded():
    providers = [_FakeProvider("A", behavior="ok"), _FakeProvider("B", behavior="ok")]
    failures: list = []
    answer, candidates, _, _ = build_ensemble_answer(
        providers=providers,
        history=[],
        user_input="Anything?",
        sources=[],
        bot_count=2,
        privacy_redaction=False,
        failures_out=failures,
    )
    assert isinstance(answer, str) and answer.strip()
    assert len(candidates) == 2
    assert failures == []


def test_refuses_an_answer_built_only_from_the_local_fallback():
    local = _FakeProvider(LOCAL_PROVIDER_NAME, behavior="ok")
    remote = _FakeProvider("Remote", behavior="error")
    with pytest.raises(NoRemoteProviderAnsweredError):
        build_ensemble_answer(
            providers=[local, remote],
            history=[],
            user_input="Anything?",
            sources=[],
            bot_count=2,
            privacy_redaction=False,
        )


def test_local_only_stack_is_not_treated_as_a_remote_failure():
    # Only the local model in the stack at all (Feature 4's local-only mode)
    # -- succeeding here is normal operation, not a degraded ensemble.
    local = _FakeProvider(LOCAL_PROVIDER_NAME, behavior="ok")
    answer, candidates, _, _ = build_ensemble_answer(
        providers=[local],
        history=[],
        user_input="Anything?",
        sources=[],
        bot_count=2,
        privacy_redaction=False,
    )
    assert isinstance(answer, str) and answer.strip()
    assert len(candidates) == 2
