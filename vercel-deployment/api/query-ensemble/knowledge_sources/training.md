# Local Model Training

The platform can train its own tiny models from scratch, with no downloads and
no API keys required. Training runs locally on Apple Silicon (MPS) or CPU.

## Pipeline

- Builds a synthetic corpus from the ensemble architecture: personas, [S#]
  citations, tradeoffs, uncertainty markers.
- Trains a TinyGPT generator (causal language model) from random weights. It
  acts as an offline ensemble candidate in the multi-bot answer flow.
- Trains a TinyScorer regressor on labeled examples. It scores any answer for
  source support, bias, and clarity.

## Commands

    python -m train.dataset    # rebuild the synthetic corpus
    python -m train.train      # train generator + scorer (~1 minute on MPS)
    python -m train.train --kind generator
    python -m train.train --kind scorer

Artifacts are saved to models/ (ensemble-generator, ensemble-scorer,
tokenizer.json) and are reproducible at any time.

## Offline demo

    python ensemble_demo.py "Your question here"

Runs the full ensemble using only the locally trained models — no API keys or
network access needed.
