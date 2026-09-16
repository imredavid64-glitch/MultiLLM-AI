from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Sequence

import streamlit as st

from ai_client import (
    ALLOWED_SOURCE_EXTENSIONS,
    SOURCES_DIR,
    Candidate,
    ChatProvider,
    SourceChunk,
    SourceIndex,
    bias_score,
    build_ensemble_answer,
    build_provider_stack,
    format_provider_status,
    format_sources_for_user,
    source_support_score,
)


APP_TITLE = "Hydra Local AI"
APP_SUBTITLE = "Parallel multi-provider bots, local source grounding, privacy controls."


def inject_styles() -> None:
    st.markdown(
        """
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        :root {
            --ink: #0e131a;
            --panel: #f4efe4;
            --accent: #0f766e;
            --accent-2: #b45309;
            --line: #d9cfbe;
            --warn: #b91c1c;
        }
        .stApp {
            background:
              radial-gradient(circle at 20% 10%, #f8f2e7 0%, #f5efe3 35%, #ece3d1 100%);
            color: var(--ink);
            font-family: 'Space Grotesk', sans-serif;
        }
        h1, h2, h3 {
            font-family: 'Space Grotesk', sans-serif !important;
            letter-spacing: -0.02em;
            color: var(--ink);
        }
        .hero-wrap {
            border: 1px solid var(--line);
            background: linear-gradient(145deg, #f9f4ea 0%, #efe3cf 100%);
            border-radius: 18px;
            padding: 1rem 1.1rem 0.7rem 1.1rem;
            box-shadow: 0 14px 35px rgba(15, 23, 42, 0.08);
            margin-bottom: 0.8rem;
        }
        .hero-title {
            margin: 0 0 0.25rem 0;
            font-size: 1.55rem;
            font-weight: 700;
        }
        .hero-sub {
            margin: 0;
            color: #334155;
            font-size: 0.93rem;
        }
        .badge-row {
            display: flex;
            flex-wrap: wrap;
            gap: 0.45rem;
            margin-top: 0.75rem;
        }
        .badge {
            font-family: 'IBM Plex Mono', monospace;
            border: 1px solid #c7bca8;
            color: #1e293b;
            background: #fff8ec;
            border-radius: 999px;
            padding: 0.2rem 0.6rem;
            font-size: 0.74rem;
            line-height: 1.2;
        }
        .metric-card {
            border: 1px solid var(--line);
            border-radius: 12px;
            padding: 0.55rem 0.7rem;
            background: #fff9ee;
            font-family: 'IBM Plex Mono', monospace;
            font-size: 0.78rem;
        }
        .ok { color: var(--accent); font-weight: 700; }
        .warn { color: var(--warn); font-weight: 700; }
        .small-note {
            color: #475569;
            font-size: 0.8rem;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def init_state() -> None:
    if "providers" not in st.session_state:
        st.session_state.providers = build_provider_stack()
    if "source_index" not in st.session_state:
        idx = SourceIndex(SOURCES_DIR)
        idx.refresh()
        st.session_state.source_index = idx
    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []
    if "turn_log" not in st.session_state:
        st.session_state.turn_log = []
    if "bot_count" not in st.session_state:
        st.session_state.bot_count = max(3, len(st.session_state.providers) or 3)
    if "privacy_redaction" not in st.session_state:
        st.session_state.privacy_redaction = True
    if "save_history" not in st.session_state:
        st.session_state.save_history = True


def safe_filename(name: str) -> str:
    cleaned = "".join(ch for ch in name if ch.isalnum() or ch in {"-", "_", ".", " "}).strip()
    return cleaned or "uploaded_file.txt"


def save_uploaded_sources(files: Sequence[st.runtime.uploaded_file_manager.UploadedFile]) -> List[str]:
    saved: List[str] = []
    SOURCES_DIR.mkdir(parents=True, exist_ok=True)
    for uploaded in files:
        suffix = Path(uploaded.name).suffix.lower()
        if suffix not in ALLOWED_SOURCE_EXTENSIONS:
            continue
        filename = safe_filename(Path(uploaded.name).name)
        target = SOURCES_DIR / filename
        target.write_bytes(uploaded.getbuffer())
        saved.append(str(target))
    return saved


def render_header(providers: Sequence[ChatProvider], source_index: SourceIndex) -> None:
    st.markdown(
        f"""
        <div class="hero-wrap">
          <p class="hero-title">{APP_TITLE}</p>
          <p class="hero-sub">{APP_SUBTITLE}</p>
          <div class="badge-row">
            <span class="badge">Providers: {len(providers)}</span>
            <span class="badge">Source files: {len(source_index.loaded_files)}</span>
            <span class="badge">Chunks: {len(source_index.chunks)}</span>
            <span class="badge">Filtered types: {len(ALLOWED_SOURCE_EXTENSIONS)}</span>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def render_sidebar() -> None:
    st.sidebar.header("Control Panel")

    st.session_state.bot_count = st.sidebar.slider(
        "Parallel bots",
        min_value=2,
        max_value=8,
        value=int(st.session_state.bot_count),
        step=1,
    )
    st.session_state.privacy_redaction = st.sidebar.toggle(
        "Privacy redaction",
        value=bool(st.session_state.privacy_redaction),
    )
    st.session_state.save_history = st.sidebar.toggle(
        "Save chat in session",
        value=bool(st.session_state.save_history),
    )

    if st.sidebar.button("Reload local sources", use_container_width=True):
        st.session_state.source_index.refresh()
        st.sidebar.success(
            f"Reloaded {len(st.session_state.source_index.loaded_files)} files "
            f"({len(st.session_state.source_index.chunks)} chunks)."
        )

    uploads = st.sidebar.file_uploader(
        "Upload knowledge files",
        type=[ext[1:] for ext in sorted(ALLOWED_SOURCE_EXTENSIONS)],
        accept_multiple_files=True,
        help="Only filtered file types are accepted and indexed locally.",
    )
    if uploads:
        saved = save_uploaded_sources(uploads)
        st.session_state.source_index.refresh()
        if saved:
            st.sidebar.success(f"Saved {len(saved)} file(s). Index refreshed.")
        else:
            st.sidebar.warning("No valid files saved from upload selection.")

    st.sidebar.caption("Provider status")
    st.sidebar.code(format_provider_status(st.session_state.providers), language="text")

    if st.sidebar.button("Clear chat", use_container_width=True):
        st.session_state.chat_history = []
        st.session_state.turn_log = []
        st.sidebar.success("Chat cleared.")


def render_message_history() -> None:
    for turn in st.session_state.turn_log:
        with st.chat_message("user"):
            st.write(turn["user"])
        with st.chat_message("assistant"):
            st.write(turn["answer"])
            c1, c2, c3 = st.columns(3)
            c1.markdown(
                f"<div class='metric-card'>source_score: <b>{turn['source_score']:.2f}</b></div>",
                unsafe_allow_html=True,
            )
            c2.markdown(
                f"<div class='metric-card'>bias_score: <b>{turn['bias_score']:.2f}</b></div>",
                unsafe_allow_html=True,
            )
            leak_class = "ok" if turn["leakage_ok"] else "warn"
            leak_text = "OK" if turn["leakage_ok"] else "REDACTED"
            c3.markdown(
                f"<div class='metric-card'>leakage: <span class='{leak_class}'>{leak_text}</span></div>",
                unsafe_allow_html=True,
            )

            with st.expander("Sources used", expanded=False):
                st.text(turn["source_list"])

            with st.expander("Top candidates", expanded=False):
                for line in turn["candidate_lines"]:
                    st.text(line)


def candidate_lines(candidates: Sequence[Candidate]) -> List[str]:
    lines: List[str] = []
    for idx, item in enumerate(candidates[:5], start=1):
        lines.append(
            f"{idx}. {item.bot_name} via {item.provider_name} | total={item.total_score:.2f} "
            f"| src={item.source_score:.2f} | bias={item.bias_score:.2f} | clarity={item.clarity_score:.2f}"
        )
    return lines


def run_turn(user_prompt: str) -> Dict:
    providers = st.session_state.providers
    if not providers:
        raise RuntimeError("No providers loaded. Add keys in ai_client.py or via env.")

    sources: List[SourceChunk] = st.session_state.source_index.retrieve(user_prompt)
    answer, candidates, token_savings = build_ensemble_answer(
        providers=providers,
        history=st.session_state.chat_history,
        user_input=user_prompt,
        sources=sources,
        bot_count=int(st.session_state.bot_count),
        privacy_redaction=bool(st.session_state.privacy_redaction),
    )

    if st.session_state.save_history:
        st.session_state.chat_history.append({"role": "user", "content": user_prompt})
        st.session_state.chat_history.append({"role": "assistant", "content": answer})

    source_score = source_support_score(answer, sources)
    bias = bias_score(answer)
    leak_ok = "[REDACTED:" not in answer

    return {
        "user": user_prompt,
        "answer": answer,
        "source_score": source_score,
        "bias_score": bias,
        "leakage_ok": leak_ok,
        "source_list": format_sources_for_user(sources),
        "candidate_lines": candidate_lines(candidates),
    }


def main() -> None:
    st.set_page_config(
        page_title=APP_TITLE,
        layout="wide",
        initial_sidebar_state="expanded",
    )
    inject_styles()
    init_state()

    providers = st.session_state.providers
    source_index = st.session_state.source_index

    render_sidebar()
    render_header(providers=providers, source_index=source_index)

    if not providers:
        st.error(
            "No providers available. Add keys in the project root "
            "`ai_client.py` or set provider env vars."
        )
        st.stop()

    st.markdown("<p class='small-note'>Ask anything. The app runs parallel bots, cross-checks responses, and shows source/quality diagnostics per turn.</p>", unsafe_allow_html=True)
    render_message_history()

    prompt = st.chat_input("Ask a question...")
    if prompt:
        with st.chat_message("user"):
            st.write(prompt)
        with st.chat_message("assistant"):
            with st.spinner("Running multi-bot ensemble..."):
                result = run_turn(prompt)
            st.write(result["answer"])
            c1, c2, c3 = st.columns(3)
            c1.markdown(
                f"<div class='metric-card'>source_score: <b>{result['source_score']:.2f}</b></div>",
                unsafe_allow_html=True,
            )
            c2.markdown(
                f"<div class='metric-card'>bias_score: <b>{result['bias_score']:.2f}</b></div>",
                unsafe_allow_html=True,
            )
            leak_class = "ok" if result["leakage_ok"] else "warn"
            leak_text = "OK" if result["leakage_ok"] else "REDACTED"
            c3.markdown(
                f"<div class='metric-card'>leakage: <span class='{leak_class}'>{leak_text}</span></div>",
                unsafe_allow_html=True,
            )
            with st.expander("Sources used", expanded=False):
                st.text(result["source_list"])
            with st.expander("Top candidates", expanded=False):
                for line in result["candidate_lines"]:
                    st.text(line)
        st.session_state.turn_log.append(result)


if __name__ == "__main__":
    main()
