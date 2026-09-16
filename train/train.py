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
import math
import time
from pathlib import Path

import torch
import torch.nn.functional as F

from train.dataset import build_lm_corpus, build_scorer_examples
from train.model import CharacterTokenizer, TinyGPT, TinyScorer, WordTokenizer
from train.prompt_refiner_data import build_prompt_refiner_corpus

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "train" / "data"
MODELS_DIR = BASE_DIR / "models"
GENERATOR_DIR = MODELS_DIR / "ensemble-generator"
SCORER_DIR = MODELS_DIR / "ensemble-scorer"
REFINER_DIR = MODELS_DIR / "prompt-refiner"


def pick_device(prefer_cpu: bool = False) -> str:
    if prefer_cpu:
        return "cpu"
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


CORPUS_VERSION = 4


def prepare_corpus() -> None:
    meta_path = DATA_DIR / "corpus.meta.json"
    current = {"version": CORPUS_VERSION}
    stale = not (DATA_DIR / "corpus.json").exists()
    if meta_path.exists():
        try:
            stale = json.loads(meta_path.read_text(encoding="utf-8")).get("version") != CORPUS_VERSION
        except Exception:
            stale = True
    else:
        stale = True
    if stale:
        docs = build_lm_corpus()
        from train.dataset import write_corpus_json

        write_corpus_json(DATA_DIR / "corpus.json", docs)
        meta_path.write_text(json.dumps(current), encoding="utf-8")
    if stale or not (DATA_DIR / "scorer_labels.json").exists():
        from train.dataset import write_scorer_json

        rows = build_scorer_examples()
        write_scorer_json(DATA_DIR / "scorer_labels.json", rows)


def load_corpus() -> list[str]:
    prepare_corpus()
    return json.loads((DATA_DIR / "corpus.json").read_text(encoding="utf-8"))


def load_scorer_labels():
    prepare_corpus()
    return json.loads((DATA_DIR / "scorer_labels.json").read_text(encoding="utf-8"))


def get_tokenizer(corpus: list[str], vocab_size: int = 4096, force: bool = False) -> WordTokenizer:
    """Word-level tokenizer used by the generator.

    The generator is trained on chat-style documents whose prompt is several
    thousand characters (question + retrieved sources + rules). A character
    tokenizer would put only ~100 words of that prompt inside a 256-token
    context window, so the generator would answer without seeing the question.
    Word tokens carry roughly 5-6x more information per token, letting the
    whole prompt fit in a modest context window (and making training far
    faster: ~270K word-tokens vs ~1.6M characters).
    """
    tok_path = MODELS_DIR / "tokenizer.json"
    corpus_hash = _corpus_hash(corpus)
    if tok_path.exists() and not force:
        meta_path = MODELS_DIR / "tokenizer.meta.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if meta.get("corpus_hash") == corpus_hash and meta.get("vocab_size") == vocab_size:
                return WordTokenizer.load(tok_path)
    tokenizer = WordTokenizer.train(corpus, vocab_size=vocab_size)
    tokenizer.save(tok_path)
    (MODELS_DIR / "tokenizer.meta.json").write_text(
        json.dumps({"corpus_hash": corpus_hash, "vocab_size": vocab_size}),
        encoding="utf-8",
    )
    return tokenizer


SCORER_TOKENIZER_PATH = MODELS_DIR / "scorer-tokenizer.json"


def get_scorer_tokenizer(corpus: list[str], vocab_size: int = 4096, force: bool = False) -> WordTokenizer:
    """Word-level tokenizer used ONLY by the scorer.

    The scorer must detect semantic features (citations, absolute words,
    structure), which are much easier to learn from word tokens than from
    character tokens. The generator shares the same word-level tokenizer.
    """
    corpus_hash = _corpus_hash(corpus)
    if SCORER_TOKENIZER_PATH.exists() and not force:
        meta_path = MODELS_DIR / "scorer-tokenizer.meta.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if meta.get("corpus_hash") == corpus_hash and meta.get("vocab_size") == vocab_size:
                return WordTokenizer.load(SCORER_TOKENIZER_PATH)
    tokenizer = WordTokenizer.train(corpus, vocab_size=vocab_size)
    tokenizer.save(SCORER_TOKENIZER_PATH)
    (MODELS_DIR / "scorer-tokenizer.meta.json").write_text(
        json.dumps({"corpus_hash": corpus_hash, "vocab_size": vocab_size}),
        encoding="utf-8",
    )
    return tokenizer


REFINER_TOKENIZER_PATH = MODELS_DIR / "refiner-tokenizer.json"


def get_refiner_tokenizer(corpus: list[str], vocab_size: int = 2048, force: bool = False) -> WordTokenizer:
    """Word-level tokenizer used ONLY by the prompt-refiner model.

    Trained on the refiner's own (much narrower) corpus, kept separate from
    the generator/scorer tokenizers since the vocabularies don't need to match.
    """
    corpus_hash = _corpus_hash(corpus)
    if REFINER_TOKENIZER_PATH.exists() and not force:
        meta_path = MODELS_DIR / "refiner-tokenizer.meta.json"
        if meta_path.exists():
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if meta.get("corpus_hash") == corpus_hash and meta.get("vocab_size") == vocab_size:
                return WordTokenizer.load(REFINER_TOKENIZER_PATH)
    tokenizer = WordTokenizer.train(corpus, vocab_size=vocab_size)
    tokenizer.save(REFINER_TOKENIZER_PATH)
    (MODELS_DIR / "refiner-tokenizer.meta.json").write_text(
        json.dumps({"corpus_hash": corpus_hash, "vocab_size": vocab_size}),
        encoding="utf-8",
    )
    return tokenizer


def _corpus_hash(corpus: list[str]) -> str:
    import hashlib

    digest = hashlib.sha256()
    for doc in corpus:
        digest.update(doc.encode("utf-8"))
    return digest.hexdigest()


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
    n_layer: int = 6,
    n_head: int = 4,
    n_embd: int = 128,
) -> None:
    torch.manual_seed(seed)
    corpus = load_corpus()
    tokenizer = get_tokenizer(corpus, vocab_size=vocab_size)
    print(f"[generator] corpus docs={len(corpus)} vocab={tokenizer.vocab_size}")

    all_ids: list[int] = []
    for doc in corpus:
        all_ids += tokenizer.encode(doc) + [tokenizer.stoi["<|endoftext|>"]]
    print(f"[generator] total tokens={len(all_ids)}")

    model = TinyGPT(
        vocab_size=tokenizer.vocab_size,
        block_size=block_size,
        n_layer=n_layer,
        n_head=n_head,
        n_embd=n_embd,
    ).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"[generator] params={n_params:,} device={device}")

    xs, ys = chunk_ids(all_ids, block_size, batch_size)
    n_batches = xs.size(0) // batch_size
    if n_batches == 0:
        raise RuntimeError("Corpus too small for block_size/batch_size.")
    print(f"[generator] blocks={xs.size(0)} batches/epoch={n_batches}")

    split = int(0.9 * xs.size(0))
    perm = torch.randperm(xs.size(0))
    xs_train, xs_val = xs[perm[:split]], xs[perm[split:]]
    ys_train, ys_val = ys[perm[:split]], ys[perm[split:]]
    n_val = xs_val.size(0) // batch_size

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.05)
    total_steps = max(1, (xs_train.size(0) // batch_size) * epochs)
    warmup = max(1, total_steps // 10)

    def schedule(step: int) -> float:
        if step < warmup:
            return (step + 1) / warmup
        progress = (step - warmup) / max(1, total_steps - warmup)
        return 0.5 * (1.0 + math.cos(math.pi * progress))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, schedule)

    start = time.time()
    best_val = float("inf")
    patience = 4
    stale = 0
    global_step = 0
    for epoch in range(epochs):
        model.train()
        total_loss = 0.0
        perm2 = torch.randperm(xs_train.size(0))
        for i in range(0, xs_train.size(0), batch_size):
            idx = perm2[i : i + batch_size]
            xb = xs_train[idx].to(device)
            yb = ys_train[idx].to(device)
            _, loss = model(xb, yb)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            global_step += 1
            total_loss += loss.item()
        avg = total_loss / max(1, xs_train.size(0) // batch_size)

        model.eval()
        val_loss = float("inf")
        if n_val:
            with torch.no_grad():
                val_total = 0.0
                for i in range(0, n_val * batch_size, batch_size):
                    xb = xs_val[i : i + batch_size].to(device)
                    yb = ys_val[i : i + batch_size].to(device)
                    _, vloss = model(xb, yb)
                    val_total += vloss.item()
                val_loss = val_total / n_val
        print(
            f"[generator] epoch {epoch + 1}/{epochs} train_loss={avg:.4f} "
            f"val_loss={val_loss:.4f} elapsed={time.time() - start:.1f}s"
        )

        if val_loss < best_val - 1e-4:
            best_val = val_loss
            stale = 0
            model.save(GENERATOR_DIR)
        else:
            stale += 1
            if stale >= patience:
                print(f"[generator] early stopping after epoch {epoch + 1} (best val {best_val:.4f})")
                break

    tokenizer.save(MODELS_DIR / "tokenizer.json")
    (MODELS_DIR / "tokenizer.meta.json").write_text(
        json.dumps({"corpus_hash": _corpus_hash(corpus), "vocab_size": tokenizer.vocab_size}),
        encoding="utf-8",
    )
    print(f"[generator] saved -> {GENERATOR_DIR} (best val {best_val:.4f})")

    model = TinyGPT.load(GENERATOR_DIR, device=device)
    model.eval()
    sample_tokens = tokenizer.encode("<|user|>\nUser request:\nHow does a multi-LLM ensemble improve answer quality?")
    try:
        sample = torch.tensor([sample_tokens], dtype=torch.long).to(device)
        out = model.generate(sample, max_new_tokens=110, temperature=0.8, top_k=40)
        print("[generator] sample:")
        print(tokenizer.decode(out[0].tolist()))
    except RuntimeError:
        cpu = TinyGPT.load(GENERATOR_DIR, device="cpu")
        cpu.eval()
        sample = torch.tensor([sample_tokens], dtype=torch.long)
        out = cpu.generate(sample, max_new_tokens=110, temperature=0.8, top_k=40)
        print("[generator] sample (cpu):")
        print(tokenizer.decode(out[0].tolist()))


REFINER_CORPUS_VERSION = 1


def prepare_refiner_corpus() -> None:
    meta_path = DATA_DIR / "prompt_refiner_corpus.meta.json"
    current = {"version": REFINER_CORPUS_VERSION}
    stale = not (DATA_DIR / "prompt_refiner_corpus.json").exists()
    if meta_path.exists():
        try:
            stale = json.loads(meta_path.read_text(encoding="utf-8")).get("version") != REFINER_CORPUS_VERSION
        except Exception:
            stale = True
    if stale:
        docs = build_prompt_refiner_corpus()
        from train.dataset import write_corpus_json

        write_corpus_json(DATA_DIR / "prompt_refiner_corpus.json", docs)
        meta_path.write_text(json.dumps(current), encoding="utf-8")


def load_refiner_corpus() -> list[str]:
    prepare_refiner_corpus()
    return json.loads((DATA_DIR / "prompt_refiner_corpus.json").read_text(encoding="utf-8"))


def train_prompt_refiner(
    device: str,
    epochs: int,
    batch_size: int,
    lr: float,
    block_size: int,
    vocab_size: int,
    seed: int,
    n_layer: int = 4,
    n_head: int = 4,
    n_embd: int = 96,
) -> None:
    """Train the prompt-refiner TinyGPT: rough prompt in, clearer prompt out.

    Same nanoGPT-style architecture and training loop as train_generator, just
    pointed at the much narrower (raw_prompt -> refined_prompt) corpus instead
    of the full ensemble-answer corpus.
    """
    torch.manual_seed(seed)
    corpus = load_refiner_corpus()
    tokenizer = get_refiner_tokenizer(corpus, vocab_size=vocab_size)
    print(f"[refiner] corpus docs={len(corpus)} vocab={tokenizer.vocab_size}")

    model = TinyGPT(
        vocab_size=tokenizer.vocab_size,
        block_size=block_size,
        n_layer=n_layer,
        n_head=n_head,
        n_embd=n_embd,
    ).to(device)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"[refiner] params={n_params:,} device={device}")

    # Each doc is packed into its OWN fixed-length example (padded, not
    # concatenated into one stream like the main generator's chunk_ids).
    # This is a strict per-example (raw -> refined) mapping, not a free-flowing
    # corpus, so every training block must start at "<|user|>" -- a sliding
    # window across doc boundaries would teach the model to condition on
    # whatever happened to precede it in the shuffled stream instead of the
    # one raw prompt it's supposed to refine.
    eos = tokenizer.stoi["<|endoftext|>"]
    padded: list[list[int]] = []
    for doc in corpus:
        encoded = tokenizer.encode(doc)[:block_size]
        encoded = encoded + [eos] * (block_size - len(encoded))
        padded.append(encoded)
    ids = torch.tensor(padded, dtype=torch.long)
    xs, ys = ids[:, :-1], ids[:, 1:]
    print(f"[refiner] total tokens={ids.numel()}")

    n_batches = xs.size(0) // batch_size
    if n_batches == 0:
        raise RuntimeError("Refiner corpus too small for block_size/batch_size.")
    print(f"[refiner] blocks={xs.size(0)} batches/epoch={n_batches}")

    split = int(0.9 * xs.size(0))
    perm = torch.randperm(xs.size(0))
    xs_train, xs_val = xs[perm[:split]], xs[perm[split:]]
    ys_train, ys_val = ys[perm[:split]], ys[perm[split:]]
    n_val = xs_val.size(0) // batch_size

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.05)
    total_steps = max(1, (xs_train.size(0) // batch_size) * epochs)
    warmup = max(1, total_steps // 10)

    def schedule(step: int) -> float:
        if step < warmup:
            return (step + 1) / warmup
        progress = (step - warmup) / max(1, total_steps - warmup)
        return 0.5 * (1.0 + math.cos(math.pi * progress))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, schedule)

    start = time.time()
    best_val = float("inf")
    patience = 4
    stale = 0
    for epoch in range(epochs):
        model.train()
        total_loss = 0.0
        perm2 = torch.randperm(xs_train.size(0))
        for i in range(0, xs_train.size(0), batch_size):
            idx = perm2[i : i + batch_size]
            xb = xs_train[idx].to(device)
            yb = ys_train[idx].to(device)
            _, loss = model(xb, yb)
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            total_loss += loss.item()
        avg = total_loss / max(1, xs_train.size(0) // batch_size)

        model.eval()
        val_loss = float("inf")
        if n_val:
            with torch.no_grad():
                val_total = 0.0
                for i in range(0, n_val * batch_size, batch_size):
                    xb = xs_val[i : i + batch_size].to(device)
                    yb = ys_val[i : i + batch_size].to(device)
                    _, vloss = model(xb, yb)
                    val_total += vloss.item()
                val_loss = val_total / n_val
        print(
            f"[refiner] epoch {epoch + 1}/{epochs} train_loss={avg:.4f} "
            f"val_loss={val_loss:.4f} elapsed={time.time() - start:.1f}s"
        )

        if val_loss < best_val - 1e-4:
            best_val = val_loss
            stale = 0
            model.save(REFINER_DIR)
        else:
            stale += 1
            if stale >= patience:
                print(f"[refiner] early stopping after epoch {epoch + 1} (best val {best_val:.4f})")
                break

    tokenizer.save(REFINER_TOKENIZER_PATH)
    print(f"[refiner] saved -> {REFINER_DIR} (best val {best_val:.4f})")

    model = TinyGPT.load(REFINER_DIR, device=device)
    model.eval()
    from train.prompt_refiner_data import build_prompt_refiner_pairs

    sample_pairs = build_prompt_refiner_pairs()[:3]
    print("[refiner] samples:")
    for raw, refined in sample_pairs:
        seed_prompt = f"<|user|>\nRaw prompt:\n{raw}\n<|assistant|>\nRefined prompt:\n"
        seed_ids = tokenizer.encode(seed_prompt)
        sample = torch.tensor([seed_ids], dtype=torch.long).to(device)
        out = model.generate(sample, max_new_tokens=30, temperature=0.3, top_k=20)
        generated = tokenizer.decode(out[0].tolist()[len(seed_ids):])
        for marker in ("<|end|>", "<|endoftext|>", "<|user|>"):
            cut = generated.find(marker)
            if cut != -1:
                generated = generated[:cut]
        print(f"  raw={raw!r}")
        print(f"  target={refined!r}")
        print(f"  model ={generated.strip()!r}")


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
    tokenizer = get_scorer_tokenizer(corpus, vocab_size=vocab_size)
    print(f"[scorer] rows={len(rows)} vocab={tokenizer.vocab_size} (word-level)")

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

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.05)
    best_val = float("inf")
    best_state = None
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
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total += loss.item()
            count += 1
        model.eval()
        with torch.no_grad():
            val_pred = model(ids_val.to(device))
            val_loss = F.mse_loss(val_pred, lab_val.to(device)).item()
        print(f"[scorer] epoch {epoch + 1}/{epochs} train_mse={total / max(1, count):.4f} val_mse={val_loss:.4f}")
        if val_loss < best_val:
            best_val = val_loss
            best_state = {k: v.detach().clone() for k, v in model.state_dict().items()}

    if best_state is not None:
        model.load_state_dict(best_state)
    model.save(SCORER_DIR)
    print(f"[scorer] saved -> {SCORER_DIR} (best val {best_val:.4f})")

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
    parser.add_argument("--kind", choices=["both", "generator", "scorer", "refiner"], default="both")
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=3e-3)
    parser.add_argument("--block-size", type=int, default=512)
    parser.add_argument("--vocab-size", type=int, default=4096)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--n-layer", type=int, default=6)
    parser.add_argument("--n-head", type=int, default=4)
    parser.add_argument("--n-embd", type=int, default=128)
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
            n_layer=args.n_layer,
            n_head=args.n_head,
            n_embd=args.n_embd,
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
    if args.kind == "refiner":
        train_prompt_refiner(
            device=device,
            epochs=args.epochs,
            batch_size=args.batch_size,
            lr=args.lr,
            block_size=args.block_size,
            vocab_size=args.vocab_size,
            seed=args.seed,
            n_layer=args.n_layer,
            n_head=args.n_head,
            n_embd=args.n_embd,
        )
    print("done.")


def write_model_registry() -> None:
    """Write a JSON manifest the SaaS reads to display real model stats.

    Generates vercel-deployment/src/lib/model-registry.json (committed), so the
    training/analytics pages show the actual trained model configuration,
    validation loss, and corpus size instead of hardcoded mock values.
    """
    import json as _json

    from train.model import TinyGPT, TinyScorer

    saas_dir = BASE_DIR / "vercel-deployment" / "src" / "lib"
    saas_dir.mkdir(parents=True, exist_ok=True)
    registry_path = saas_dir / "model-registry.json"

    # `models/` is gitignored, so on any given machine only some of
    # generator/scorer/refiner may actually be trained locally. Start from
    # whatever is already committed instead of a blank dict, so training just
    # one kind (e.g. `--kind refiner`) can't clobber another kind's real,
    # previously-recorded stats with an "error: file not found" stub.
    entry: dict = {
        "generator": {"name": "ensemble-generator", "kind": "generator"},
        "scorer": {"name": "ensemble-scorer", "kind": "scorer"},
        "refiner": {"name": "prompt-refiner", "kind": "refiner"},
    }
    if registry_path.exists():
        try:
            existing = _json.loads(registry_path.read_text(encoding="utf-8"))
            for key, value in existing.items():
                if isinstance(value, dict):
                    entry.setdefault(key, {}).update(value)
                else:
                    entry[key] = value
        except Exception:
            pass
    try:
        cfg = _json.loads((GENERATOR_DIR / "config.json").read_text(encoding="utf-8"))
        cfg.pop("kind", None)
        cfg["params"] = sum(p.numel() for p in TinyGPT.load(GENERATOR_DIR, device="cpu").parameters())
        entry["generator"].update(cfg)
    except Exception as exc:  # pragma: no cover - best-effort
        entry["generator"]["error"] = str(exc)

    try:
        cfg = _json.loads((SCORER_DIR / "config.json").read_text(encoding="utf-8"))
        cfg.pop("kind", None)
        cfg["params"] = sum(p.numel() for p in TinyScorer.load(SCORER_DIR, device="cpu").parameters())
        entry["scorer"].update(cfg)
    except Exception as exc:  # pragma: no cover - best-effort
        entry["scorer"]["error"] = str(exc)

    try:
        cfg = _json.loads((REFINER_DIR / "config.json").read_text(encoding="utf-8"))
        cfg.pop("kind", None)
        cfg["params"] = sum(p.numel() for p in TinyGPT.load(REFINER_DIR, device="cpu").parameters())
        entry["refiner"].update(cfg)
    except Exception as exc:  # pragma: no cover - best-effort
        entry["refiner"]["error"] = str(exc)

    try:
        docs = load_corpus()
        entry["corpus"] = {
            "docs": len(docs),
            "chars": sum(len(d) for d in docs),
            "version": CORPUS_VERSION,
        }
    except Exception as exc:  # pragma: no cover - best-effort
        entry["corpus"] = {"error": str(exc)}

    try:
        refiner_docs = load_refiner_corpus()
        entry["refiner_corpus"] = {
            "docs": len(refiner_docs),
            "chars": sum(len(d) for d in refiner_docs),
            "version": REFINER_CORPUS_VERSION,
        }
    except Exception as exc:  # pragma: no cover - best-effort
        entry["refiner_corpus"] = {"error": str(exc)}

    (saas_dir / "model-registry.json").write_text(_json.dumps(entry, indent=2), encoding="utf-8")
    print(f"[registry] wrote {saas_dir / 'model-registry.json'}")


if __name__ == "__main__":
    main()
    write_model_registry()
