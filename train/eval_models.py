"""Comprehensive test harness for the trained Multi-LLM models.

Evaluates:
  1. Generator  - coherence, style compliance, memorization vs. generalization
  2. Scorer     - regression error + directional accuracy on labeled answers
  3. End-to-end - ensemble scoring blend and latency

Usage:
  python -m train.eval_models
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any, Dict, List

import torch

from ai_client import SourceIndex, bias_score, clarity_score, source_support_score
from local_models import LocalModels, model_score_answer

BASE_DIR = Path(__file__).resolve().parent.parent
SOURCES_DIR = BASE_DIR / "knowledge_sources"

TRAINED_QUESTIONS = [
    "How does a multi-LLM ensemble improve answer quality?",
    "What is privacy redaction in this system?",
    "Why is bias reduction important in AI answers?",
]
NOVEL_QUESTIONS = [
    "Why should I trust answers that cite their sources?",
    "How does parallel processing speed up getting an answer?",
    "What are the risks of relying on one AI model alone?",
]

ABSOLUTE_WORDS = {"always", "never", "everyone", "nobody", "guaranteed", "obviously", "undeniable", "proves", "must"}
UNCERTAINTY_WORDS = {"uncertain", "approximate", "depends", "limited", "edge cases", "tradeoff", "balance", "may vary"}


def make_prompt(question: str) -> str:
    return (
        f"<|user|>\nUser request:\n{question}\n\n"
        "Local sources:\n[S1] An ensemble queries several independent models in parallel and merges the best parts.\n\n"
        "Answer rules:\n- Use citations [S#] for factual statements when possible.\n"
        "- If a fact is unsupported, label it as uncertain.\n"
        "- Avoid one-sided framing. Present tradeoffs.\n"
        "- Do not reveal sensitive identifiers.\n"
        "<|assistant|>\nPersona: Factual Analyst. Prioritize precise facts and explicit assumptions.\n"
        "Keep final answer practical and concise.\nBot answer:\n"
    )


def generate(question: str, max_new: int = 450, temperature: float = 0.5) -> str:
    tok = _LM.tokenizer()
    model = _LM.generator()
    ids = tok.encode(make_prompt(question))
    seed = torch.tensor([ids], dtype=torch.long)
    with torch.no_grad():
        out = model.generate(seed, max_new_tokens=max_new, temperature=temperature, top_k=40)
    text = tok.decode(out[0].tolist()[len(ids) :])
    for marker in ("<|end|>", "<|endoftext|>", "<|user|>"):
        idx = text.find(marker)
        if idx != -1:
            text = text[:idx]
    return " ".join(text.split()).strip()


def word_count(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9']+", text))


def unique_ratio(text: str) -> float:
    words = re.findall(r"[a-z0-9']+", text.lower())
    if not words:
        return 0.0
    return len(set(words)) / len(words)


def measure_style(text: str) -> dict:
    lower = text.lower()
    return {
        "words": word_count(text),
        "unique_ratio": round(unique_ratio(text), 2),
        "has_citation": bool(re.search(r"\[S\d+\]", text)),
        "has_tradeoff": "tradeoff" in lower,
        "has_uncertainty": any(w in lower for w in UNCERTAINTY_WORDS),
        "absolute_word_hits": sum(1 for w in ABSOLUTE_WORDS if re.search(rf"\b{w}\b", lower)),
        "citations": len(re.findall(r"\[S\d+\]", text)),
    }


def run_generator_tests() -> dict:
    results: Dict[str, List[Dict[str, Any]]] = {"trained": [], "novel": []}
    for label, questions in (("trained", TRAINED_QUESTIONS), ("novel", NOVEL_QUESTIONS)):
        for q in questions:
            t0 = time.time()
            text = generate(q)
            results[label].append(
                {"question": q, "text": text, "elapsed": round(time.time() - t0, 2), **measure_style(text)}
            )
    return results


def run_scorer_tests() -> dict:
    labels_path = BASE_DIR / "train" / "data" / "scorer_labels.json"
    rows = json.loads(labels_path.read_text(encoding="utf-8"))
    per_dim: Dict[str, List[float]] = {"source_support": [], "bias_score": [], "clarity_score": []}
    class_errors: Dict[str, List[float]] = {}
    for r in rows:
        pred = model_score_answer(r["text"])
        if pred is None:
            continue
        for i, dim in enumerate(per_dim):
            err = abs(pred[i] - r[dim])
            per_dim[dim].append(err)
        # class by label fingerprint
        t = (r["source_support"], r["bias_score"], r["clarity_score"])
        cls = _classify(t)
        class_errors.setdefault(cls, []).append(
            abs(pred[0] - r["source_support"]) + abs(pred[1] - r["bias_score"]) + abs(pred[2] - r["clarity_score"])
        )

    mae_per_dim: Dict[str, float] = {}
    class_mae: Dict[str, float] = {}
    for dim, errs in per_dim.items():
        mae_per_dim[dim] = round(sum(errs) / len(errs), 4)
    for cls, errs in sorted(class_errors.items()):
        class_mae[cls] = round(sum(errs) / len(errs), 3)
    return {"n": len(rows), "mae_per_dim": mae_per_dim, "class_mae": class_mae}


def _classify(t: tuple) -> str:
    s, b, c = t
    if s >= 0.8 and b >= 0.75 and c >= 0.8:
        return "grounded"
    if s <= 0.25:
        return "vague"
    if b <= 0.2:
        return "biased"
    if c <= 0.55:
        return "rambling"
    if s <= 0.4 and c >= 0.7:
        return "unsupported-clear"
    return "mixed"


def run_e2e() -> dict:
    index = SourceIndex(SOURCES_DIR)
    index.refresh()
    t0 = time.time()
    sources = index.retrieve("How does a multi-LLM ensemble improve answer quality?", top_k=3)
    text = generate("How does a multi-LLM ensemble improve answer quality?")
    s, b, c = source_support_score(text, sources), bias_score(text), clarity_score(text)
    learned = model_score_answer(text)
    return {
        "sources_retrieved": len(sources),
        "generated_words": word_count(text),
        "heuristic": {"support": round(s, 2), "bias": round(b, 2), "clarity": round(c, 2)},
        "learned": [round(x, 2) for x in learned] if learned else None,
        "retrieve_sec": round(time.time() - t0, 2),
    }


_LM = LocalModels()


def main() -> None:
    print("=" * 70)
    print("MULTI-LLM MODEL TEST REPORT")
    print("=" * 70)

    print("\n--- 1. GENERATOR ---")
    gen = run_generator_tests()
    for group in ("trained", "novel"):
        print(f"\n[{group} questions]")
        for item in gen[group]:
            print(f"  Q: {item['question']}")
            print(f"  A: {item['text'][:120]}")
            print(
                f"  [words={item['words']} unique={item['unique_ratio']} "
                f"citation={item['has_citation']} tradeoff={item['has_tradeoff']} "
                f"uncertainty={item['has_uncertainty']} abs_hits={item['absolute_word_hits']} "
                f"elapsed={item['elapsed']}s]"
            )
    # aggregate style compliance
    for group in ("trained", "novel"):
        items = gen[group]
        n = len(items)
        agg = {
            "avg_words": round(sum(i["words"] for i in items) / n, 1),
            "avg_unique_ratio": round(sum(i["unique_ratio"] for i in items) / n, 2),
            "pct_citation": round(100 * sum(i["has_citation"] for i in items) / n),
            "pct_tradeoff": round(100 * sum(i["has_tradeoff"] for i in items) / n),
            "pct_uncertainty": round(100 * sum(i["has_uncertainty"] for i in items) / n),
            "avg_abs_hits": round(sum(i["absolute_word_hits"] for i in items) / n, 2),
        }
        print(f"\n  {group} aggregate: {agg}")

    print("\n--- 2. SCORER ---")
    sc = run_scorer_tests()
    print(f"  rows evaluated: {sc['n']}")
    for dim, mae in sc["mae_per_dim"].items():
        print(f"  MAE {dim:14} = {mae}")
    print("  MAE by answer class:")
    for cls, mae in sc["class_mae"].items():
        print(f"    {cls:18} = {mae}")

    print("\n--- 3. END-TO-END ---")
    e2e = run_e2e()
    for k, v in e2e.items():
        print(f"  {k}: {v}")

    print("\n" + "=" * 70)
    print("END REPORT")


if __name__ == "__main__":
    main()
