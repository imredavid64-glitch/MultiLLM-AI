"""Train the Multi-LLM tiny models from scratch on MPS/CPU.

Trains two artifacts from a synthetic corpus built from the ensemble
architecture (see dataset.py):
  - models/ensemble-generator/   TinyGPT causal LM (offline ensemble candidate)
  - models/ensemble-scorer/      TinyScorer (answer-quality regression)

Usage:
  python -m train.train            # train both
  python -m train.train --kind generator
  python -m train.train --kind scorer
  python -m train.train --epochs 20 --batch-size 8
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
import torch.nn.functional as F

from train.dataset import build_lm_corpus, build_scorer_examples
from train.model import TinyGPT, TinyScorer, WordTokenizer

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "train" / "data"
MODELS_DIR = BASE_DIR / "models"
GENERATOR_DIR = MODELS_DIR / "ensemble-generator"
SCORER_DIR = MODELS_DIR / "ensemble-scorer"


def pick_device(prefer_cpu: bool = False) -> str:
    if prefer_cpu:
        return "cpu"
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def prepare_corpus() -> None:
    if not (DATA_DIR / "corpus.json").exists():
        docs = build_lm_corpus()
        from train.dataset import write_corpus_json

        write_corpus_json(DATA_DIR / "corpus.json", docs)
    if not (DATA_DIR / "scorer_labels.json").exists():
        from train.dataset import write_scorer_json

        rows = build_scorer_examples()
        write_scorer_json(DATA_DIR / "scorer_labels.json", rows)


def load_corpus() -> list[str]:
    prepare_corpus()
    return json.loads((DATA_DIR / "corpus.json").read_text(encoding="utf-8"))


def load_scorer_labels():
    prepare_corpus()
    return json.loads((DATA_DIR / "scorer_labels.json").read_text(encoding="utf-8"))


def get_tokenizer(corpus: list[str], vocab_size: int = 2048, force: bool = False) -> WordTokenizer:
    tok_path = MODELS_DIR / "tokenizer.json"
    if tok_path.exists() and not force:
        return WordTokenizer.load(tok_path)
    tokenizer = WordTokenizer.train(corpus, vocab_size=vocab_size)
    tokenizer.save(tok_path)
    return tokenizer


def chunk_ids(
    ids: list[int], block_size: int, batch_size: int
) -> tuple[torch.Tensor, torch.Tensor]:
    """Pack token ids into overlapping (x, targets) blocks."""
    xs: list[list[int]] = []
    ys: list[list[int]] = []
    step = max(1, block_size // 2)
    for i in range(0, max(1, len(ids) - block_size), step):
        block = ids[i : i + block_size + 1]
        if len(block) < 2:
            continue
        xs.append(block[:-1])
        ys.append(block[1:])
    if not xs:
        return torch.empty(0, dtype=torch.long), torch.empty(0, dtype=torch.long)
    xs_t = torch.tensor(xs, dtype=torch.long)
    ys_t = torch.tensor(ys, dtype=torch.long)
    n = xs_t.size(0) - (xs_t.size(0) % batch_size)
    return xs_t[:n], ys_t[:n]


def train_generator(
    device: str,
    epochs: int,
    batch_size: int,
    lr: float,
    block_size: int,
    vocab_size: int,
    seed: int,
) -> None:
    torch.manual_seed(seed)
    corpus = load_corpus()
    tokenizer = get_tokenizer(corpus, vocab_size=vocab_size)
    print(f"[generator] corpus docs={len(corpus)} vocab={tokenizer.vocab_size}")

    all_ids: list[int] = []
    for doc in corpus:
        all_ids += tokenizer.encode(doc) + [tokenizer.stoi["<|endoftext|>"]]
    print(f"[generator] total tokens={len(all_ids)}")

    model = TinyGPT(vocab_size=tokenizer.vocab_size, block_size=block_size).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"[generator] params={n_params:,} device={device}")

    xs, ys = chunk_ids(all_ids, block_size, batch_size)
    n_batches = xs.size(0) // batch_size
    if n_batches == 0:
        raise RuntimeError("Corpus too small for block_size/batch_size.")
    print(f"[generator] blocks={xs.size(0)} batches/epoch={n_batches}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    start = time.time()
    for epoch in range(epochs):
        perm = torch.randperm(xs.size(0))
        total_loss = 0.0
        for i in range(0, xs.size(0), batch_size):
            idx = perm[i : i + batch_size]
            xb = xs[idx].to(device)
            yb = ys[idx].to(device)
            _, loss = model(xb, yb)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item()
        avg = total_loss / (xs.size(0) // batch_size)
        print(f"[generator] epoch {epoch + 1}/{epochs} loss={avg:.4f} elapsed={time.time() - start:.1f}s")

    tokenizer.save(MODELS_DIR / "tokenizer.json")
    model.save(GENERATOR_DIR)
    print(f"[generator] saved -> {GENERATOR_DIR}")

    sample_tokens = tokenizer.encode("<|user|>\nUser request:\nHow does a multi-LLM ensemble improve answer quality?")
    sample = torch.tensor([sample_tokens], dtype=torch.long).to(device)
    out = model.generate(sample, max_new_tokens=90, temperature=0.8, top_k=40)
    print("[generator] sample:")
    print(tokenizer.decode(out[0].tolist()))


def train_scorer(
    device: str,
    epochs: int,
    batch_size: int,
    lr: float,
    vocab_size: int,
    seed: int,
) -> None:
    torch.manual_seed(seed)
    rows = load_scorer_labels()
    corpus = load_corpus()
    tokenizer = get_tokenizer(corpus, vocab_size=vocab_size)
    print(f"[scorer] rows={len(rows)} vocab={tokenizer.vocab_size}")

    texts = [r["text"] for r in rows]
    labels = torch.tensor(
        [[r["source_support"], r["bias_score"], r["clarity_score"]] for r in rows],
        dtype=torch.float32,
    )
    block = 192
    padded: list[list[int]] = []
    for t in texts:
        encoded = tokenizer.encode(t)[:block]
        padded.append(encoded + [tokenizer.stoi["<|endoftext|>"]] * (block - len(encoded)))
    ids = torch.tensor(padded, dtype=torch.long)

    n = ids.size(0)
    n_train = int(0.8 * n)
    perm = torch.randperm(n)
    ids_train, ids_val = ids[perm[:n_train]], ids[perm[n_train:]]
    lab_train, lab_val = labels[perm[:n_train]], labels[perm[n_train:]]

    model = TinyScorer(vocab_size=tokenizer.vocab_size).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"[scorer] params={n_params:,} device={device}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    for epoch in range(epochs):
        model.train()
        perm2 = torch.randperm(ids_train.size(0))
        total = 0.0
        count = 0
        for i in range(0, ids_train.size(0), batch_size):
            idx = perm2[i : i + batch_size]
            xb = ids_train[idx].to(device)
            yb = lab_train[idx].to(device)
            pred = model(xb)
            loss = F.mse_loss(pred, yb)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            total += loss.item()
            count += 1
        model.eval()
        with torch.no_grad():
            val_pred = model(ids_val.to(device))
            val_loss = F.mse_loss(val_pred, lab_val.to(device)).item()
        print(f"[scorer] epoch {epoch + 1}/{epochs} train_mse={total / max(1, count):.4f} val_mse={val_loss:.4f}")

    model.save(SCORER_DIR)
    print(f"[scorer] saved -> {SCORER_DIR}")

    model.eval()
    with torch.no_grad():
        pred = model(ids.to(device))
    for r, p in zip(rows, pred.tolist()):
        print(
            f"  target=({r['source_support']:.2f},{r['bias_score']:.2f},{r['clarity_score']:.2f}) "
            f"pred=({p[0]:.2f},{p[1]:.2f},{p[2]:.2f})  text={r['text'][:48]}..."
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Multi-LLM tiny models from scratch")
    parser.add_argument("--kind", choices=["both", "generator", "scorer"], default="both")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=3e-3)
    parser.add_argument("--block-size", type=int, default=128)
    parser.add_argument("--vocab-size", type=int, default=2048)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--cpu", action="store_true", help="force CPU even if MPS is available")
    args = parser.parse_args()

    device = pick_device(prefer_cpu=args.cpu)
    print(f"device={device}")

    if args.kind in ("both", "generator"):
        train_generator(
            device=device,
            epochs=args.epochs,
            batch_size=args.batch_size,
            lr=args.lr,
            block_size=args.block_size,
            vocab_size=args.vocab_size,
            seed=args.seed,
        )
    if args.kind in ("both", "scorer"):
        train_scorer(
            device=device,
            epochs=args.epochs,
            batch_size=args.batch_size,
            lr=args.lr,
            vocab_size=args.vocab_size,
            seed=args.seed,
        )
    print("done.")


if __name__ == "__main__":
    main()
