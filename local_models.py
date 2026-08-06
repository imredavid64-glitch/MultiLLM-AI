"""Integration layer: trained Multi-LLM models inside the ensemble.

Adds two capabilities to the ai_client.py architecture:
  1. LocalTransformerProvider  — an offline ensemble candidate. It generates
     answers in the multi-bot style (citations [S#], tradeoffs, uncertainty)
     without any API key or network call, so it can always participate.
  2. model_score_answer        — replaces the heuristic scoring functions with
     the trained TinyScorer. It returns (source_support, bias, clarity).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional, Sequence

from ai_client import ChatProvider, GenerationConfig

BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
GENERATOR_DIR = MODELS_DIR / "ensemble-generator"
SCORER_DIR = MODELS_DIR / "ensemble-scorer"
TOKENIZER_PATH = MODELS_DIR / "tokenizer.json"


class LocalModels:
    """Lazy loader that keeps the tiny models resident once loaded."""

    def __init__(self, device: str = "auto") -> None:
        self.device = device
        self._tokenizer = None
        self._generator = None
        self._scorer = None

    def available(self) -> bool:
        return GENERATOR_DIR.exists() and SCORER_DIR.exists() and TOKENIZER_PATH.exists()

    def _pick_device(self) -> str:
        if self.device != "auto":
            return self.device
        try:
            import torch

            if torch.backends.mps.is_available():
                return "mps"
            if torch.cuda.is_available():
                return "cuda"
        except Exception:
            pass
        return "cpu"

    def tokenizer(self):
        if self._tokenizer is None:
            from train.model import WordTokenizer

            self._tokenizer = WordTokenizer.load(TOKENIZER_PATH)
        return self._tokenizer

    def generator(self):
        if self._generator is None:
            from train.model import TinyGPT

            self._generator = TinyGPT.load(GENERATOR_DIR, device=self._pick_device())
        return self._generator

    def scorer(self):
        if self._scorer is None:
            from train.model import TinyScorer

            self._scorer = TinyScorer.load(SCORER_DIR, device=self._pick_device())
        return self._scorer

    def generator_info(self) -> Dict:
        cfg = json.loads((GENERATOR_DIR / "config.json").read_text(encoding="utf-8"))
        return cfg


_LOCAL = LocalModels()


class LocalTransformerProvider:
    """A ChatProvider backed by the locally trained TinyGPT model.

    Produces offline candidate answers using the ensemble answering style.
    Falls back gracefully when the trained model is missing.
    """

    def __init__(self, temperature: float = 0.7, max_tokens: int = 140) -> None:
        self.name = "Local TinyGPT (from scratch)"
        self.model = "ensemble-generator (4-layer TinyGPT)"
        self.temperature = temperature
        self.max_tokens = max_tokens

    def size(self) -> int:
        return 1 if _LOCAL.available() else 0

    def chat(
        self,
        messages: Sequence[Dict[str, str]],
        temperature: float,
        gen_p: "GenerationConfig | None" = None,
    ) -> str:
        from ai_client import flatten_messages, redact_sensitive

        prompt = flatten_messages(messages)
        prompt = redact_sensitive(prompt)

        if not _LOCAL.available():
            raise RuntimeError("Trained model not found. Run: python -m train.train")

        tokenizer = _LOCAL.tokenizer()
        model = _LOCAL.generator()
        temp = gen_p.temperature if gen_p is not None else temperature

        seed_ids = tokenizer.encode("<|user|>\n" + prompt + "\n<|assistant|>\n")
        import torch

        device = next(model.parameters()).device
        seed = torch.tensor([seed_ids], dtype=torch.long, device=device)
        max_tokens = gen_p.max_tokens if gen_p is not None and gen_p.max_tokens else self.max_tokens
        with torch.no_grad():
            out = model.generate(seed, max_new_tokens=max_tokens, temperature=temp, top_k=40, repetition_penalty=1.3)
        text = tokenizer.decode(out[0].tolist()[len(seed_ids):])
        # Trim trailing special tokens or repeated block markers.
        for marker in ("<|end|>", "<|endoftext|>", "<|user|>"):
            idx = text.find(marker)
            if idx != -1:
                text = text[:idx]
        return text.strip() or "(local model produced an empty candidate)"


def model_score_answer(
    answer: str,
    sources: Sequence = (),
    fallback: bool = True,
) -> Optional[List[float]]:
    """Score an answer with the trained TinyScorer.

    Returns [source_support, bias_score, clarity_score] in 0..1, or None when
    the trained model is unavailable.
    """
    if not _LOCAL.available():
        return None

    try:
        from ai_client import redact_sensitive

        tokenizer = _LOCAL.tokenizer()
        scorer = _LOCAL.scorer()
        import torch

        block = 192
        encoded = tokenizer.encode(redact_sensitive(answer))[:block]
        padded = encoded + [tokenizer.stoi["<|endoftext|>"]] * (block - len(encoded))
        device = next(scorer.parameters()).device
        idx = torch.tensor([padded], dtype=torch.long, device=device)
        with torch.no_grad():
            pred = scorer(idx)[0].tolist()
        return [float(p) for p in pred]
    except Exception:
        return None


def blend_score(
    answer: str,
    sources: Sequence,
    source_score: float,
    bias_score: float,
    clarity_score: float,
) -> List[float]:
    """Blend heuristic and learned scores when both are available."""
    learned = model_score_answer(answer, sources=sources)
    if learned is None:
        return [source_score, bias_score, clarity_score]
    return [
        0.5 * source_score + 0.5 * learned[0],
        0.5 * bias_score + 0.5 * learned[1],
        0.5 * clarity_score + 0.5 * learned[2],
    ]
