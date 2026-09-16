"""Synthetic training corpus for the prompt-refiner model.

The refiner is a small from-scratch TinyGPT that takes a rough, casually
phrased user prompt and rewrites it into a clearer question -- an "AI helping
the prompt" pre-processing step that runs before the ensemble itself. It
reuses the same canonical questions/paraphrases already curated in
dataset.py (DOMAIN_EXAMPLES / QUESTION_PARAPHRASES) as the "refined" targets,
and synthesizes casual/rough variants of them as inputs.
"""
from __future__ import annotations

import json
import random
from pathlib import Path
from typing import List, Tuple

from train.dataset import QUESTION_PARAPHRASES

FILLERS = [
    "um so",
    "like basically",
    "ok so",
    "hey quick question",
    "kinda wondering",
    "not sure but",
    "so yeah",
    "quick q",
]

TRAILERS = [
    "basically",
    "if that makes sense",
    "kind of",
    "or whatever",
    "i guess",
    "you know",
    "or something",
]


def _casualize(question: str, rng: random.Random, style: int) -> str:
    """Return a rough, casually phrased variant of a clean question."""
    text = question.rstrip("?").strip()
    if text:
        text = text[0].lower() + text[1:]

    if style == 0:
        return f"{rng.choice(FILLERS)} {text}"
    if style == 1:
        return f"{text} {rng.choice(TRAILERS)}"
    if style == 2:
        # Terse fragment: drop the leading wh-word/auxiliary.
        words = text.split()
        if len(words) > 4:
            words = words[2:]
        return " ".join(words)
    if style == 3:
        return f"{rng.choice(FILLERS)} {text} {rng.choice(TRAILERS)}"
    return text  # plain lowercase, no question mark


def build_prompt_refiner_pairs(seed: int = 2, variants_per_question: int = 10) -> List[Tuple[str, str]]:
    """Return (raw_prompt, refined_prompt) pairs.

    Each canonical question (QUESTION_PARAPHRASES[i][0]) is the refinement
    target. Raw inputs are casualized versions of every paraphrase plus
    additional randomized casual rewrites of the canonical form itself.
    """
    rng = random.Random(seed)
    pairs: List[Tuple[str, str]] = []

    for paraphrase_set in QUESTION_PARAPHRASES:
        refined = paraphrase_set[0]
        raw_seen = set()

        for paraphrase in paraphrase_set:
            for style in range(5):
                raw = _casualize(paraphrase, rng, style)
                if raw and raw not in raw_seen:
                    raw_seen.add(raw)
                    pairs.append((raw, refined))

        for _ in range(variants_per_question):
            style = rng.randint(0, 4)
            raw = _casualize(refined, rng, style)
            if raw and raw not in raw_seen:
                raw_seen.add(raw)
                pairs.append((raw, refined))

    rng.shuffle(pairs)
    return pairs


def build_prompt_refiner_corpus(seed: int = 2, variants_per_question: int = 10) -> List[str]:
    """Return chat-style training documents for the refiner LM."""
    pairs = build_prompt_refiner_pairs(seed=seed, variants_per_question=variants_per_question)
    docs = []
    for raw, refined in pairs:
        doc = f"<|user|>\nRaw prompt:\n{raw}\n<|assistant|>\nRefined prompt:\n{refined}\n<|end|>\n"
        docs.append(doc)
    return docs


def write_prompt_refiner_json(path: Path, pairs: List[Tuple[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [{"raw": raw, "refined": refined} for raw, refined in pairs]
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    out_dir = Path(__file__).resolve().parent / "data"
    pairs = build_prompt_refiner_pairs()
    write_prompt_refiner_json(out_dir / "prompt_refiner_pairs.json", pairs)
    print(f"prompt refiner: {len(pairs)} (raw -> refined) pairs across {len(QUESTION_PARAPHRASES)} canonical questions")
