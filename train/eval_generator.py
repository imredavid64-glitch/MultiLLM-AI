"""Evaluate the trained generator on fresh questions.

Measures how well the model generalizes: does it produce a coherent answer
in the ensemble style when asked questions similar to (but not identical to)
the training data?

Usage:
  python -m train.eval_generator
"""

from __future__ import annotations

from pathlib import Path

import torch

from train.model import WordTokenizer

BASE_DIR = Path(__file__).resolve().parent.parent
TOKENIZER_PATH = BASE_DIR / "models" / "tokenizer.json"
GENERATOR_DIR = BASE_DIR / "models" / "ensemble-generator"

NOVEL_QUESTIONS = [
    "Why should I trust answers that cite their sources?",
    "How does parallel processing speed up getting an answer?",
    "What are the risks of relying on one AI model alone?",
    "Can you explain how scores are combined into one ranking?",
    "What makes some responses more trustworthy than others?",
    "How do local files improve the relevance of replies?",
]


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


def main() -> None:
    tokenizer = WordTokenizer.load(TOKENIZER_PATH)
    from train.model import TinyGPT

    model = TinyGPT.load(GENERATOR_DIR, device="cpu")
    model.eval()

    for question in NOVEL_QUESTIONS:
        prompt = make_prompt(question)
        ids = tokenizer.encode(prompt)
        seed = torch.tensor([ids], dtype=torch.long)
        with torch.no_grad():
            out = model.generate(seed, max_new_tokens=450, temperature=0.5, top_k=40)
        text = tokenizer.decode(out[0].tolist()[len(ids) :])
        for marker in ("<|end|>", "<|endoftext|>", "<|user|>"):
            idx = text.find(marker)
            if idx != -1:
                text = text[:idx]
        text = " ".join(text.split()).strip()
        print(f"Q: {question}")
        print(f"A: {text[:220]}")
        print("-" * 60)


if __name__ == "__main__":
    main()
