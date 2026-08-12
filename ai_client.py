from __future__ import annotations

import json
import math
import os
import re
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Protocol, Sequence, Set, Tuple
"""
OPENAI API KEY used from OPENROUTER, and a GEMINI API KEY used from GOOGLE AI STUDIO
"""
try:
    from openai import OpenAI
except Exception:
    print("Install/upgrade the OpenAI SDK first: pip install -U openai")
    raise

try:
    from openai import APIError, APITimeoutError, RateLimitError
except Exception:
    APIError = Exception
    APITimeoutError = Exception
    RateLimitError = Exception

try:
    import httpx
except Exception:
    httpx = None


BASE_DIR = Path(__file__).resolve().parent
HISTORY_FILE = BASE_DIR / "chat_history.json"
SOURCES_DIR = BASE_DIR / "knowledge_sources"

# Optional local env file (gitignored) holding provider keys.
#   OPENAI_API_KEY / OPENAI_API_KEYS  (OpenRouter: sk-or-v1-...)
#   GEMINI_API_KEY / GEMINI_API_KEYS
#   MISTRAL_API_KEY / MISTRAL_API_KEYS
def load_env_file(path: Path | None = None) -> None:
    source = path or (BASE_DIR / ".env")
    if not source.exists():
        return
    try:
        raw = source.read_text(encoding="utf-8")
    except OSError:
        return
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and value and key not in os.environ:
            os.environ[key] = value


load_env_file()

DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"
DEFAULT_MISTRAL_MODEL = "mistral-small-latest"

# Provider keys are loaded ONLY from environment variables or key files.
# No keys are hardcoded here. Set at least one of the env vars below:
#   OPENAI_API_KEYS / OPENAI_API_KEY / OPENAI_API_KEYS_FILE
#   GEMINI_API_KEYS / GEMINI_API_KEY / GEMINI_API_KEYS_FILE
#   MISTRAL_API_KEYS / MISTRAL_API_KEY / MISTRAL_API_KEYS_FILE

MAX_RETRIES = 4
MAX_HISTORY_MESSAGES = 12
MAX_PARALLEL_BOTS = 8
TOP_K_SOURCES = 6

SAVE_HISTORY_DEFAULT = os.environ.get("SAVE_HISTORY", "1").strip() == "1"
PRIVACY_REDACTION_DEFAULT = os.environ.get("PRIVACY_REDACTION", "1").strip() == "1"

BOT_PERSONAS: List[Tuple[str, str]] = [
    ("Factual Analyst", "Prioritize precise facts and explicit assumptions."),
    ("Skeptical Reviewer", "Challenge weak claims and point out uncertainty."),
    ("Neutral Teacher", "Explain clearly for non-experts with minimal jargon."),
    ("Risk Auditor", "Look for safety, privacy, and compliance risks."),
    ("Counter-Bias Bot", "Actively detect one-sided framing and rebalance perspectives."),
]

ALLOWED_SOURCE_EXTENSIONS = {
    ".txt",
    ".md",
    ".rst",
    ".json",
    ".csv",
    ".tsv",
    ".html",
    ".htm",
    ".xml",
    ".log",
    ".py",
}

UPLOAD_GUIDE = {
    "science": [
        "textbook chapters (.txt/.md)",
        "peer-reviewed paper exports (.txt/.json)",
        "trusted encyclopedic summaries (.md)",
    ],
    "finance": [
        "regulatory filings (.txt/.html)",
        "earnings transcripts (.txt)",
        "local policy docs and models (.csv/.json)",
    ],
    "medicine": [
        "clinical guidelines (.txt/.md)",
        "drug reference tables (.csv/.json)",
        "de-identified case notes only (.txt)",
    ],
    "law": [
        "local statutes and regulations (.txt)",
        "court decision summaries (.md/.txt)",
        "internal policy memos (.txt/.json)",
    ],
    "engineering": [
        "API docs and design specs (.md/.txt)",
        "runbooks and postmortems (.md/.txt)",
        "structured config/data dictionaries (.json/.csv)",
    ],
    "general": [
        "notes, books, and docs in plain text formats",
        "trusted sources converted to .txt/.md for best retrieval quality",
    ],
}

SYSTEM_PROMPT_BASE = """
You are one bot inside a multi-bot answer ensemble.
Goals:
1) Be accurate and honest about uncertainty.
2) Reduce bias by presenting balanced alternatives.
3) Cite provided local source ids like [S1], [S2] whenever factual claims are made.
4) If source support is weak, say what is uncertain instead of guessing.
5) Never output secrets or private identifiers.
"""

SENSITIVE_PATTERNS = [
    ("OpenAI key", re.compile(r"sk-[A-Za-z0-9_-]{20,}")),
    ("Email", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    ("US SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("Credit card", re.compile(r"\b(?:\d[ -]*?){13,16}\b")),
    ("Phone", re.compile(r"\b(?:\+?\d{1,3}[ -]?)?(?:\(?\d{2,4}\)?[ -]?)?\d{3,4}[ -]?\d{4}\b")),
]

ABSOLUTE_WORDS = {
    "always",
    "never",
    "everyone",
    "nobody",
    "guaranteed",
    "obviously",
    "undeniable",
    "proves",
    "must",
}

STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "your",
    "have",
    "will",
    "would",
    "what",
    "when",
    "where",
    "which",
    "about",
    "there",
    "their",
    "them",
    "into",
    "than",
    "then",
    "because",
    "while",
    "after",
    "before",
}

TOKEN_RE = re.compile(r"[A-Za-z0-9_]{2,}")


@dataclass
class SourceChunk:
    source_id: str
    path: Path
    text: str
    tokens: Set[str]
    tf: Dict[str, int] = field(default_factory=dict)
    length: int = 0


@dataclass
class Candidate:
    bot_name: str
    provider_name: str
    provider_index: int
    text: str
    source_score: float
    bias_score: float
    clarity_score: float
    total_score: float


class ChatProvider(Protocol):
    name: str
    model: str

    def size(self) -> int:
        ...

    def chat(
        self,
        messages: Sequence[Dict[str, str]],
        temperature: float,
        gen: "GenerationConfig | None" = None,
    ) -> str:
        ...


@dataclass
class GenerationConfig:
    """Generation & sampling parameters for a single call."""

    temperature: float = 0.2
    top_p: float | None = None
    top_k: int | None = None
    max_tokens: int | None = None
    repetition_penalty: float | None = None


def _translate_rep_penalty(value: float) -> float:
    """Map a TinyGPT-style repetition penalty (1.0 = none) to an OpenAI/Mistral
    frequency/presence penalty (0.0 = none, positive = discourage repetition).
    """
    if value <= 1.0:
        return 0.0
    return round(value - 1.0, 3)


class RoundRobinKeys:
    def __init__(self, keys: Sequence[str]) -> None:
        self._keys = list(keys)
        self._cursor = 0
        self._lock = threading.Lock()

    def next(self) -> str:
        with self._lock:
            key = self._keys[self._cursor % len(self._keys)]
            self._cursor += 1
            return key

    def size(self) -> int:
        return len(self._keys)


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def tokenize(text: str) -> List[str]:
    words = [w.lower() for w in TOKEN_RE.findall(text)]
    return [w for w in words if w not in STOPWORDS]


def redact_sensitive(text: str) -> str:
    sanitized = text
    for label, pattern in SENSITIVE_PATTERNS:
        sanitized = pattern.sub(f"[REDACTED:{label.upper().replace(' ', '_')}]", sanitized)
    return sanitized


def detect_sensitive_hits(text: str) -> List[str]:
    hits = []
    for label, pattern in SENSITIVE_PATTERNS:
        if pattern.search(text):
            hits.append(label)
    return hits


def parse_bool_env(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def parse_int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return max(minimum, min(maximum, parsed))


def load_keys_from_env(
    multi_env: str,
    single_env: str,
    file_env: str | None = None,
) -> List[str]:
    keys: List[str] = []

    multi = os.environ.get(multi_env, "")
    if multi:
        keys.extend(k.strip() for k in multi.split(",") if k.strip())

    single = os.environ.get(single_env, "").strip()
    if single:
        keys.append(single)

    if file_env:
        from_file = os.environ.get(file_env, "").strip()
        if from_file:
            key_file = Path(from_file).expanduser()
            if key_file.exists():
                lines = [line.strip() for line in key_file.read_text(encoding="utf-8").splitlines()]
                keys.extend(line for line in lines if line and not line.startswith("#"))

    deduped: List[str] = []
    seen = set()
    for key in keys:
        if key not in seen:
            seen.add(key)
            deduped.append(key)
    return deduped


def dedupe_keys(keys: Sequence[str]) -> List[str]:
    deduped: List[str] = []
    seen = set()
    for key in keys:
        normalized = key.strip()
        if normalized and normalized not in seen:
            seen.add(normalized)
            deduped.append(normalized)
    return deduped


def infer_openai_base_url(keys: Sequence[str]) -> str:
    explicit = os.environ.get("OPENAI_BASE_URL", "").strip()
    if explicit:
        return explicit
    if keys and all(key.startswith("sk-or-v1-") for key in keys):
        return "https://openrouter.ai/api/v1"
    return ""


def flatten_messages(messages: Sequence[Dict[str, str]]) -> str:
    lines: List[str] = []
    for msg in messages:
        role = msg.get("role", "user").upper()
        content = msg.get("content", "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n\n".join(lines)


def http_post_json(
    url: str,
    payload: Dict,
    headers: Dict[str, str],
    timeout_seconds: float = 45.0,
) -> Dict:
    if httpx is None:
        raise RuntimeError("httpx is required for Gemini/Mistral calls. Install with: pip install -U httpx")

    try:
        with httpx.Client(timeout=timeout_seconds) as client:
            response = client.post(url=url, json=payload, headers=headers)
            response.raise_for_status()
            return response.json() if response.text.strip() else {}
    except httpx.HTTPStatusError as exc:
        detail = normalize_whitespace(exc.response.text)[:360]
        raise RuntimeError(f"HTTP {exc.response.status_code}: {detail}") from exc
    except httpx.RequestError as exc:
        raise RuntimeError(f"Network error: {exc}") from exc


def extract_text_from_openai_like(response) -> str:
    try:
        message = response.choices[0].message
        content = getattr(message, "content", "")
    except Exception:
        return ""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                text = block.get("text", "")
                if text:
                    parts.append(text)
            else:
                text = getattr(block, "text", "")
                if text:
                    parts.append(text)
        return "\n".join(parts).strip()
    return str(content).strip()


def extract_gemini_text(payload: Dict) -> str:
    candidates = payload.get("candidates", [])
    if not candidates:
        return ""
    content = candidates[0].get("content", {})
    parts = content.get("parts", [])
    texts = [part.get("text", "") for part in parts if isinstance(part, dict) and part.get("text")]
    return "\n".join(texts).strip()


def extract_mistral_text(payload: Dict) -> str:
    choices = payload.get("choices", [])
    if not choices:
        return ""
    message = choices[0].get("message", {})
    content = message.get("content", "")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        texts = []
        for item in content:
            if isinstance(item, dict) and item.get("text"):
                texts.append(item["text"])
        return "\n".join(texts).strip()
    return str(content).strip()


class OpenAIProvider:
    def __init__(self, api_keys: Sequence[str], model: str, base_url: str = "") -> None:
        self.model = model
        self.base_url = base_url.strip()
        self.name = "OpenRouter (OpenAI API)" if "openrouter.ai" in self.base_url else "OpenAI-compatible"
        self._clients = []
        for key in api_keys:
            kwargs = {"api_key": key}
            if self.base_url:
                kwargs["base_url"] = self.base_url
            self._clients.append(OpenAI(**kwargs))
        self._cursor = 0
        self._lock = threading.Lock()

    def _next_client(self) -> OpenAI:
        with self._lock:
            client = self._clients[self._cursor % len(self._clients)]
            self._cursor += 1
            return client

    def size(self) -> int:
        return len(self._clients)

    def chat(
        self,
        messages: Sequence[Dict[str, str]],
        temperature: float,
        gen_p: "GenerationConfig | None" = None,
    ) -> str:
        kwargs = {"model": self.model, "messages": list(messages), "temperature": temperature}
        if gen_p is None:
            gen_p = GenerationConfig(temperature=temperature)
        if gen_p.max_tokens is not None:
            kwargs["max_tokens"] = gen_p.max_tokens
        if gen_p.top_p is not None:
            kwargs["top_p"] = gen_p.top_p
        if gen_p.repetition_penalty is not None:
            kwargs["frequency_penalty"] = _translate_rep_penalty(gen_p.repetition_penalty)
            kwargs["presence_penalty"] = 0.0
        last_error = None
        for attempt in range(MAX_RETRIES):
            client = self._next_client()
            try:
                response = client.chat.completions.create(**kwargs)
                text = extract_text_from_openai_like(response)
                if text:
                    return text
                last_error = RuntimeError("Empty response from OpenAI-compatible provider")
            except (RateLimitError, APITimeoutError, APIError) as exc:
                last_error = exc
                time.sleep(2 ** attempt)
            except Exception as exc:
                last_error = exc
                time.sleep(2 ** attempt)
        raise RuntimeError(f"{self.name} call failed after retries: {last_error}")


class GeminiProvider:
    def __init__(self, api_keys: Sequence[str], model: str) -> None:
        self.name = "Google Gemini"
        self.model = model
        self._keys = RoundRobinKeys(api_keys)
        self._model_candidates = self._build_model_candidates(model)
        self._model_lock = threading.Lock()

    def size(self) -> int:
        return self._keys.size()

    def _set_active_model(self, candidate_model: str) -> None:
        with self._model_lock:
            self.model = candidate_model

    @staticmethod
    def _build_model_candidates(primary_model: str) -> List[str]:
        candidates = [
            primary_model,
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-1.5-flash",
            "gemini-1.5-pro",
        ]
        deduped: List[str] = []
        seen = set()
        for item in candidates:
            normalized = item.strip()
            if normalized and normalized not in seen:
                seen.add(normalized)
                deduped.append(normalized)
        return deduped

    def chat(
        self,
        messages: Sequence[Dict[str, str]],
        temperature: float,
        gen_p: "GenerationConfig | None" = None,
    ) -> str:
        prompt = flatten_messages(messages)
        if gen_p is None:
            gen_p = GenerationConfig(temperature=temperature)
        gen_config: Dict = {"temperature": temperature}
        if gen_p.top_p is not None:
            gen_config["topP"] = gen_p.top_p
        if gen_p.top_k is not None:
            gen_config["topK"] = gen_p.top_k
        if gen_p.max_tokens is not None:
            gen_config["maxOutputTokens"] = gen_p.max_tokens
        last_error = None
        for candidate_model in self._model_candidates:
            model_name = urllib.parse.quote(candidate_model, safe="")
            for attempt in range(MAX_RETRIES):
                key = self._keys.next()
                url = (
                    f"https://generativelanguage.googleapis.com/v1beta/models/"
                    f"{model_name}:generateContent?key={urllib.parse.quote(key, safe='')}"
                )
                payload = {
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": gen_config,
                }
                try:
                    data = http_post_json(
                        url=url,
                        payload=payload,
                        headers={"Content-Type": "application/json"},
                    )
                    text = extract_gemini_text(data)
                    if text:
                        self._set_active_model(candidate_model)
                        return text
                    last_error = RuntimeError("Empty response from Gemini provider")
                except Exception as exc:
                    last_error = exc
                    # If the model itself is unavailable, skip to the next model candidate.
                    if "HTTP 404" in str(exc) and "models/" in str(exc):
                        break
                    # Quota or auth errors can vary by model; try next model quickly.
                    if "HTTP 429" in str(exc) or "HTTP 401" in str(exc) or "HTTP 403" in str(exc):
                        break
                    time.sleep(2 ** attempt)
        raise RuntimeError(f"{self.name} call failed after retries: {last_error}")


class MistralProvider:
    def __init__(self, api_keys: Sequence[str], model: str) -> None:
        self.name = "Mistral"
        self.model = model
        self._keys = RoundRobinKeys(api_keys)

    def size(self) -> int:
        return self._keys.size()

    def chat(
        self,
        messages: Sequence[Dict[str, str]],
        temperature: float,
        gen_p: "GenerationConfig | None" = None,
    ) -> str:
        if gen_p is None:
            gen_p = GenerationConfig(temperature=temperature)
        payload = {
            "model": self.model,
            "messages": list(messages),
            "temperature": temperature,
        }
        if gen_p.top_p is not None:
            payload["top_p"] = gen_p.top_p
        if gen_p.top_k is not None:
            payload["top_k"] = gen_p.top_k
        if gen_p.max_tokens is not None:
            payload["max_tokens"] = gen_p.max_tokens
        if gen_p.repetition_penalty is not None:
            payload["presence_penalty"] = _translate_rep_penalty(gen_p.repetition_penalty)
            payload["frequency_penalty"] = 0.0
        last_error = None
        for attempt in range(MAX_RETRIES):
            key = self._keys.next()
            try:
                data = http_post_json(
                    url="https://api.mistral.ai/v1/chat/completions",
                    payload=payload,
                    headers={
                        "Authorization": f"Bearer {key}",
                        "Content-Type": "application/json",
                    },
                )
                text = extract_mistral_text(data)
                if text:
                    return text
                last_error = RuntimeError("Empty response from Mistral provider")
            except Exception as exc:
                last_error = exc
                time.sleep(2 ** attempt)
        raise RuntimeError(f"{self.name} call failed after retries: {last_error}")


def build_provider_stack() -> List[ChatProvider]:
    providers: List[ChatProvider] = []

    try:
        from local_models import LocalTransformerProvider

        if LocalTransformerProvider().size():
            providers.append(LocalTransformerProvider())
    except Exception:
        pass

    openai_keys = load_keys_from_env(
        multi_env="OPENAI_API_KEYS",
        single_env="OPENAI_API_KEY",
        file_env="OPENAI_API_KEYS_FILE",
    )
    if openai_keys:
        base_url = infer_openai_base_url(openai_keys)
        openai_model = os.environ.get("OPENAI_MODEL", "").strip()
        if not openai_model:
            openai_model = DEFAULT_OPENROUTER_MODEL if "openrouter.ai" in base_url else DEFAULT_OPENAI_MODEL
        providers.append(OpenAIProvider(api_keys=openai_keys, model=openai_model, base_url=base_url))

    gemini_keys = load_keys_from_env(
        multi_env="GEMINI_API_KEYS",
        single_env="GEMINI_API_KEY",
        file_env="GEMINI_API_KEYS_FILE",
    )
    if gemini_keys:
        gemini_model = os.environ.get("GEMINI_MODEL", DEFAULT_GEMINI_MODEL).strip() or DEFAULT_GEMINI_MODEL
        providers.append(GeminiProvider(api_keys=gemini_keys, model=gemini_model))

    mistral_keys = load_keys_from_env(
        multi_env="MISTRAL_API_KEYS",
        single_env="MISTRAL_API_KEY",
        file_env="MISTRAL_API_KEYS_FILE",
    )
    if mistral_keys:
        mistral_model = os.environ.get("MISTRAL_MODEL", DEFAULT_MISTRAL_MODEL).strip() or DEFAULT_MISTRAL_MODEL
        providers.append(MistralProvider(api_keys=mistral_keys, model=mistral_model))

    return providers


def format_provider_status(providers: Sequence[ChatProvider]) -> str:
    lines = []
    for provider in providers:
        lines.append(f"- {provider.name}: model={provider.model}, keys={provider.size()}")
    return "\n".join(lines) if lines else "(no providers configured)"


def load_chat_history() -> List[Dict[str, str]]:
    if HISTORY_FILE.exists():
        try:
            with HISTORY_FILE.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
            if isinstance(data, list):
                return [msg for msg in data if isinstance(msg, dict) and "role" in msg and "content" in msg]
        except Exception:
            print("Warning: failed to load chat history. Starting with a clean history.")
    return []


def save_chat_history(history: Sequence[Dict[str, str]]) -> None:
    HISTORY_FILE.write_text(json.dumps(list(history), indent=2, ensure_ascii=False), encoding="utf-8")


def read_source_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix not in ALLOWED_SOURCE_EXTENSIONS:
        return ""

    try:
        raw = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""

    if suffix in {".html", ".htm", ".xml"}:
        raw = re.sub(r"<[^>]+>", " ", raw)
    return normalize_whitespace(raw)


def chunk_text(text: str, max_chars: int = 850) -> Iterable[str]:
    if not text:
        return []
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    if not paragraphs:
        paragraphs = [text]
    chunks: List[str] = []
    current: List[str] = []
    current_len = 0
    for paragraph in paragraphs:
        piece = paragraph.strip()
        if not piece:
            continue
        if current_len + len(piece) + 1 > max_chars and current:
            chunks.append(" ".join(current))
            current = [piece]
            current_len = len(piece)
        else:
            current.append(piece)
            current_len += len(piece) + 1
    if current:
        chunks.append(" ".join(current))
    return chunks


def _term_frequencies(tokens: Sequence[str]) -> Dict[str, int]:
    tf: Dict[str, int] = {}
    for token in tokens:
        tf[token] = tf.get(token, 0) + 1
    return tf


def _compute_idf(chunks: Sequence[SourceChunk]) -> Dict[str, float]:
    doc_count = len(chunks)
    if doc_count == 0:
        return {}
    df: Dict[str, int] = {}
    for chunk in chunks:
        for token in chunk.tokens:
            df[token] = df.get(token, 0) + 1
    idf: Dict[str, float] = {}
    for token, freq in df.items():
        idf[token] = 1.0 + math.log(doc_count / (1.0 + freq))
    return idf


def _bm25_score(
    chunk: SourceChunk,
    q_tf: Dict[str, int],
    idf: Dict[str, float],
    avg_len: float,
    k1: float = 1.5,
    b: float = 0.75,
) -> float:
    if chunk.length == 0:
        return 0.0
    norm = 1.0 - b + b * (chunk.length / avg_len)
    score = 0.0
    for term, q_freq in q_tf.items():
        if term not in chunk.tf:
            continue
        df = chunk.tf[term] * (k1 + 1.0) / (chunk.tf[term] + k1 * norm)
        idf_term = idf.get(term, 1.5)
        score += q_freq * idf_term * df
    return score


class SourceIndex:
    def __init__(self, source_dir: Path) -> None:
        self.source_dir = source_dir
        self.chunks: List[SourceChunk] = []
        self.loaded_files: List[Path] = []
        self._idf: Dict[str, float] = {}
        self._avg_len = 0.0

    def refresh(self) -> None:
        self.source_dir.mkdir(parents=True, exist_ok=True)
        chunks: List[SourceChunk] = []
        loaded: List[Path] = []

        for path in sorted(self.source_dir.rglob("*")):
            if not path.is_file():
                continue
            if path.suffix.lower() not in ALLOWED_SOURCE_EXTENSIONS:
                continue
            if path.stat().st_size > 7 * 1024 * 1024:
                continue
            text = read_source_text(path)
            if not text:
                continue
            loaded.append(path)
            for piece in chunk_text(text):
                tokens = tokenize(piece)
                if not tokens:
                    continue
                source_id = f"S{len(chunks) + 1}"
                chunks.append(
                    SourceChunk(
                        source_id=source_id,
                        path=path,
                        text=piece,
                        tokens=set(tokens),
                        tf=_term_frequencies(tokens),
                        length=len(tokens),
                    )
                )

        self.chunks = chunks
        self.loaded_files = loaded
        self._idf = _compute_idf(chunks)
        if chunks:
            self._avg_len = sum(c.length for c in chunks) / len(chunks)

    def retrieve(self, query: str, top_k: int = TOP_K_SOURCES) -> List[SourceChunk]:
        if not self.chunks:
            return []
        q_tokens = tokenize(query)
        if not q_tokens:
            return []

        q_tf = _term_frequencies(q_tokens)
        scored: List[Tuple[float, SourceChunk]] = []
        avg_len = self._avg_len or 1.0
        for chunk in self.chunks:
            score = _bm25_score(chunk, q_tf, self._idf, avg_len)
            if score <= 0.0:
                continue
            scored.append((score, chunk))

        scored.sort(key=lambda item: item[0], reverse=True)
        return [chunk for _, chunk in scored[:top_k]]


def format_sources_for_prompt(sources: Sequence[SourceChunk]) -> str:
    if not sources:
        return "No local sources available."
    lines = []
    for item in sources:
        lines.append(f"[{item.source_id}] {item.path.name}: {item.text[:700]}")
    return "\n".join(lines)


def format_sources_for_user(sources: Sequence[SourceChunk]) -> str:
    if not sources:
        return "(no source snippets matched this question)"
    lines = []
    for item in sources:
        lines.append(f"- [{item.source_id}] {item.path}")
    return "\n".join(lines)


def source_support_score(answer: str, sources: Sequence[SourceChunk]) -> float:
    if not answer:
        return 0.0
    if not sources:
        return 0.55

    source_token_sets = [chunk.tokens for chunk in sources]
    sentences = [s.strip() for s in re.split(r"[.!?]\s+", answer) if len(s.strip()) > 25]
    if not sentences:
        return 0.5

    supported = 0
    for sentence in sentences:
        sentence_tokens = set(tokenize(sentence))
        if not sentence_tokens:
            continue
        best_overlap = 0.0
        for token_set in source_token_sets:
            overlap = len(sentence_tokens & token_set) / max(1, len(sentence_tokens))
            if overlap > best_overlap:
                best_overlap = overlap
        has_citation = bool(re.search(r"\[S\d+\]", sentence))
        if best_overlap >= 0.18 or has_citation:
            supported += 1

    return supported / max(1, len(sentences))


def bias_score(answer: str) -> float:
    if not answer:
        return 0.0
    words = [w.lower() for w in TOKEN_RE.findall(answer)]
    if not words:
        return 0.5
    abs_hits = sum(1 for w in words if w in ABSOLUTE_WORDS)
    citation_hits = len(re.findall(r"\[S\d+\]", answer))
    penalty = 0.07 * abs_hits
    bonus = min(0.25, 0.03 * citation_hits)
    return max(0.0, min(1.0, 0.75 - penalty + bonus))


def clarity_score(answer: str) -> float:
    words = answer.split()
    word_count = len(words)
    if word_count < 35:
        length_score = 0.5
    elif word_count <= 280:
        length_score = 1.0
    elif word_count <= 500:
        length_score = 0.75
    else:
        length_score = 0.55
    structure_bonus = 1.0 if ("\n-" in answer or "\n1." in answer) else 0.85
    return max(0.0, min(1.0, 0.7 * length_score + 0.3 * structure_bonus))


def select_bot_configs(bot_count: int) -> List[Tuple[str, str]]:
    configs = []
    idx = 0
    while len(configs) < bot_count:
        persona = BOT_PERSONAS[idx % len(BOT_PERSONAS)]
        suffix = "" if idx < len(BOT_PERSONAS) else f" #{idx + 1}"
        configs.append((persona[0] + suffix, persona[1]))
        idx += 1
    return configs


def generate_candidate(
    provider: ChatProvider,
    history: Sequence[Dict[str, str]],
    user_input: str,
    source_context: str,
    bot_name: str,
    bot_instruction: str,
    privacy_redaction: bool,
    gen_p: "GenerationConfig" = GenerationConfig(),
) -> str:
    safe_user_input = redact_sensitive(user_input) if privacy_redaction else user_input
    recent_history = list(history[-MAX_HISTORY_MESSAGES:])
    if privacy_redaction:
        recent_history = [
            {"role": item["role"], "content": redact_sensitive(item["content"])}
            for item in recent_history
        ]

    system_prompt = (
        SYSTEM_PROMPT_BASE.strip()
        + "\nPersona: "
        + bot_name
        + ". "
        + bot_instruction
        + "\nKeep final answer practical and concise."
    )
    task_prompt = (
        "User request:\n"
        f"{safe_user_input}\n\n"
        "Local sources:\n"
        f"{source_context}\n\n"
        "Answer rules:\n"
        "- Use citations [S#] for factual statements when possible.\n"
        "- If a fact is unsupported, label it as uncertain.\n"
        "- Avoid one-sided framing. Present tradeoffs.\n"
        "- Do not reveal sensitive identifiers.\n"
    )

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(recent_history)
    messages.append({"role": "user", "content": task_prompt})
    return provider.chat(messages=messages, temperature=gen_p.temperature, gen_p=gen_p)


def build_ensemble_answer(
    providers: Sequence[ChatProvider],
    history: Sequence[Dict[str, str]],
    user_input: str,
    sources: Sequence[SourceChunk],
    bot_count: int,
    privacy_redaction: bool,
    gen_p: "GenerationConfig" = GenerationConfig(),
) -> Tuple[str, List[Candidate]]:
    source_context = format_sources_for_prompt(sources)
    bot_configs = select_bot_configs(bot_count)
    if not providers:
        raise RuntimeError("No providers configured. Set API keys before testing.")

    candidates: List[Candidate] = []
    with ThreadPoolExecutor(max_workers=bot_count) as executor:
        future_map = {}
        for idx, (bot_name, instruction) in enumerate(bot_configs):
            provider_index = idx % len(providers)
            provider = providers[provider_index]
            future = executor.submit(
                generate_candidate,
                provider,
                history,
                user_input,
                source_context,
                bot_name,
                instruction,
                privacy_redaction,
                gen_p,
            )
            future_map[future] = (bot_name, provider_index)

        for future in as_completed(future_map):
            bot_name, provider_index = future_map[future]
            provider_name = providers[provider_index].name
            try:
                text = future.result().strip()
                s_score = source_support_score(text, sources)
                b_score = bias_score(text)
                c_score = clarity_score(text)
                try:
                    from local_models import blend_score

                    s_score, b_score, c_score = blend_score(
                        text, sources, s_score, b_score, c_score
                    )
                except Exception:
                    pass
                total = (0.50 * s_score) + (0.25 * b_score) + (0.25 * c_score)
            except Exception as exc:
                text = f"(bot failed: {exc})"
                s_score = 0.0
                b_score = 0.0
                c_score = 0.0
                total = 0.0

            candidates.append(
                Candidate(
                    bot_name=bot_name,
                    provider_name=provider_name,
                    provider_index=provider_index,
                    text=text,
                    source_score=s_score,
                    bias_score=b_score,
                    clarity_score=c_score,
                    total_score=total,
                )
            )

    successful = [item for item in candidates if not item.text.startswith("(bot failed:")]
    successful.sort(key=lambda item: item.total_score, reverse=True)
    if not successful:
        raise RuntimeError("All provider calls failed. Check API keys, models, and network access.")

    top_candidates = successful[:3]
    synthesis_provider = providers[top_candidates[0].provider_index]
    for candidate in top_candidates:
        provider = providers[candidate.provider_index]
        if provider.name != "Local TinyGPT (from scratch)":
            synthesis_provider = provider
            break

    synthesis_prompt = (
        "You are the final judge. Merge the best parts of candidate answers into one superior response.\n"
        "Rules:\n"
        "- Keep only claims with source support or mark as uncertain.\n"
        "- Preserve balanced framing to reduce bias.\n"
        "- Keep citations like [S1] when factual claims are retained.\n"
        "- If candidates conflict, explain the conflict briefly.\n\n"
        f"User question:\n{redact_sensitive(user_input) if privacy_redaction else user_input}\n\n"
        "Candidate answers:\n"
    )
    for idx, item in enumerate(top_candidates, start=1):
        synthesis_prompt += (
            f"Candidate {idx} ({item.bot_name}, provider={item.provider_name}, score={item.total_score:.2f}):\n"
            f"{item.text}\n\n"
        )

    synthesis_messages = [
        {"role": "system", "content": "Produce one final, practical, unbiased answer."},
        {"role": "user", "content": synthesis_prompt},
    ]

    try:
        synthesis_gen = GenerationConfig(temperature=0.1, max_tokens=gen_p.max_tokens)
        final_answer = synthesis_provider.chat(messages=synthesis_messages, temperature=0.1, gen_p=synthesis_gen)
    except Exception:
        final_answer = successful[0].text

    if detect_sensitive_hits(final_answer):
        final_answer = redact_sensitive(final_answer)

    return final_answer.strip(), successful


def print_help() -> None:
    print("Commands:")
    print("  /help            Show commands")
    print("  /quit            Exit")
    print("  /providers       Show loaded providers/models/key counts")
    print("  /sources         List currently indexed local source files")
    print("  /reload          Rebuild source index from knowledge_sources/")
    print("  /upload-guide    Show what file types to upload by topic")
    print("  /privacy on|off  Toggle local redaction before API calls")
    print("  /history on|off  Toggle local chat history persistence")


def print_upload_guide() -> None:
    print("Upload guide (place files under knowledge_sources/):")
    print(f"Accepted file types: {', '.join(sorted(ALLOWED_SOURCE_EXTENSIONS))}")
    for topic, files in UPLOAD_GUIDE.items():
        print(f"- {topic}:")
        for item in files:
            print(f"    * {item}")
    print("Avoid uploading secrets. Redaction is best-effort, not perfect.")


def handle_command(
    command: str,
    source_index: SourceIndex,
    providers: Sequence[ChatProvider],
    runtime_flags: Dict[str, bool],
) -> bool:
    parts = command.strip().split()
    head = parts[0].lower()

    if head == "/help":
        print_help()
        return True
    if head == "/quit":
        raise KeyboardInterrupt
    if head == "/providers":
        print("Loaded providers:")
        print(format_provider_status(providers))
        return True
    if head == "/sources":
        if not source_index.loaded_files:
            print(f"No source files loaded yet. Put files in: {SOURCES_DIR}")
        else:
            print("Indexed source files:")
            for file_path in source_index.loaded_files:
                print(f"- {file_path}")
        return True
    if head == "/reload":
        source_index.refresh()
        print(f"Reloaded sources: {len(source_index.loaded_files)} files, {len(source_index.chunks)} chunks.")
        return True
    if head == "/upload-guide":
        print_upload_guide()
        return True
    if head == "/privacy" and len(parts) == 2:
        value = parts[1].lower()
        if value in {"on", "off"}:
            runtime_flags["privacy_redaction"] = value == "on"
            print(f"Privacy redaction set to: {runtime_flags['privacy_redaction']}")
            return True
    if head == "/history" and len(parts) == 2:
        value = parts[1].lower()
        if value in {"on", "off"}:
            runtime_flags["save_history"] = value == "on"
            print(f"Local history saving set to: {runtime_flags['save_history']}")
            return True
    return False


def main() -> None:
    providers = build_provider_stack()
    if not providers:
        print("No provider API keys found.")
        print("Set at least one provider key set before starting:")
        print("  export OPENAI_API_KEYS='k1,k2' or OPENAI_API_KEY='k1'")
        print("  export GEMINI_API_KEYS='k1,k2' or GEMINI_API_KEY='k1'")
        print("  export MISTRAL_API_KEYS='k1,k2' or MISTRAL_API_KEY='k1'")
        return

    requested_bots = parse_int_env("BOT_COUNT", default=4, minimum=2, maximum=MAX_PARALLEL_BOTS)
    bot_count = max(requested_bots, len(providers))

    source_index = SourceIndex(SOURCES_DIR)
    source_index.refresh()

    runtime_flags = {
        "save_history": parse_bool_env("SAVE_HISTORY", SAVE_HISTORY_DEFAULT),
        "privacy_redaction": parse_bool_env("PRIVACY_REDACTION", PRIVACY_REDACTION_DEFAULT),
    }
    chat_history = load_chat_history() if runtime_flags["save_history"] else []

    print("Multi-bot AI client started.")
    print(f"Parallel bots: {bot_count}")
    print("Providers:")
    print(format_provider_status(providers))
    print(f"Local sources: {len(source_index.loaded_files)} files, {len(source_index.chunks)} chunks")
    print("Privacy mode: local redaction is", "ON" if runtime_flags["privacy_redaction"] else "OFF")
    print("Type /help for commands, /quit to exit.")
    print("-" * 64)

    while True:
        try:
            user_input = input("You: ").strip()
            if not user_input:
                continue

            if user_input.startswith("/"):
                handled = handle_command(user_input, source_index, providers, runtime_flags)
                if not handled:
                    print("Unknown command. Type /help for available commands.")
                continue

            if runtime_flags["privacy_redaction"]:
                redaction_hits = detect_sensitive_hits(user_input)
                if redaction_hits:
                    print(
                        "Privacy warning: sensitive patterns detected in your prompt -> "
                        + ", ".join(redaction_hits)
                    )
                    print("The prompt will be redacted before it is sent to remote APIs.")

            retrieved_sources = source_index.retrieve(user_input, top_k=TOP_K_SOURCES)
            answer, candidates = build_ensemble_answer(
                providers=providers,
                history=chat_history,
                user_input=user_input,
                sources=retrieved_sources,
                bot_count=bot_count,
                privacy_redaction=runtime_flags["privacy_redaction"],
            )

            print("\nAI:")
            print(answer)
            print("\nSource checks:")
            print(format_sources_for_user(retrieved_sources))
            print("\nResponse checks:")
            print(
                f"- top candidate: {candidates[0].bot_name} via {candidates[0].provider_name}"
                f" (score={candidates[0].total_score:.2f})"
            )
            print(f"- source support score: {source_support_score(answer, retrieved_sources):.2f}")
            print(f"- bias score: {bias_score(answer):.2f}")
            print("- leakage scan:", "OK" if not detect_sensitive_hits(answer) else "REDACTED")
            print("-" * 64)

            if runtime_flags["save_history"]:
                chat_history.append({"role": "user", "content": user_input})
                chat_history.append({"role": "assistant", "content": answer})
                save_chat_history(chat_history)

        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        except Exception as exc:
            print(f"Error: {exc}")


if __name__ == "__main__":
    main()
