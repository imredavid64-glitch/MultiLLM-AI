from __future__ import annotations

import time
from typing import Dict, List, Sequence, Tuple

import streamlit as st

from ai_client import (
    SOURCES_DIR,
    Candidate,
    ChatProvider,
    SourceChunk,
    SourceIndex,
    bias_score,
    build_provider_stack,
    detect_sensitive_hits,
    format_provider_status,
    format_sources_for_user,
    source_support_score,
    GenerationConfig,
)

APP_TITLE = "Hydra Model Testbench"
APP_SUBTITLE = "Instrumented harness: per-candidate scores, latency, errors, and raw responses."


def init_state() -> None:
    if "test_providers" not in st.session_state:
        st.session_state.test_providers = build_provider_stack()
    if "test_index" not in st.session_state:
        idx = SourceIndex(SOURCES_DIR)
        idx.refresh()
        st.session_state.test_index = idx
    if "test_log" not in st.session_state:
        st.session_state.test_log: List[Dict] = []
    if "generation_config" not in st.session_state:
        st.session_state.generation_config = GenerationConfig()
    if "tb_bot_count" not in st.session_state:
        st.session_state.tb_bot_count = 4
    if "tb_privacy" not in st.session_state:
        st.session_state.tb_privacy = True


def percentile(values: List[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(q * len(ordered)))
    return ordered[idx]


def run_one(prompt: str, bot_count: int, privacy: bool, gen_cfg: "GenerationConfig") -> Dict:
    base = {
        "prompt": prompt,
        "answer": "",
        "candidates": [],
        "sources": [],
        "latency": 0.0,
        "error": None,
    }
    try:
        start = time.perf_counter()
        sources = st.session_state.test_index.retrieve(prompt)
        answer, candidates = build_ensemble_answer(
            providers=st.session_state.test_providers,
            history=[],
            user_input=prompt,
            sources=sources,
            bot_count=bot_count,
            privacy_redaction=privacy,
            gen_p=gen_cfg,
        )
        elapsed = time.perf_counter() - start
        top = (
            f"{candidates[0].bot_name} via {candidates[0].provider_name} "
            f"({candidates[0].total_score:.3f})"
            if candidates
            else "n/a"
        )
        base.update(
            {
                "answer": answer,
                "candidates": candidates,
                "sources": sources,
                "latency": elapsed,
                "source_score": source_support_score(answer, sources),
                "bias_score": bias_score(answer),
                "redaction_hits": detect_sensitive_hits(answer),
                "top_candidate": top,
            }
        )
    except Exception as exc:
        base["error"] = str(exc)
    return base


def render_generation_settings() -> "GenerationConfig":
    st.sidebar.markdown("**Generation & Sampling**")
    st.sidebar.markdown(
        "Temperature · Top-P · Top-K · Max tokens · Repetition penalty (explained above in the concepts list)",
        help=(
            "Temperature: randomness vs determinism.\n"
            "Top-P (Nucleus): dynamic pool at cumulative probability P.\n"
            "Top-K: restrict to the K highest-scoring tokens.\n"
            "Max tokens: cap on output length.\n"
            "Repetition penalty: discounts already-used tokens to reduce looping."
        ),
    )
    temperature = st.sidebar.slider("Temperature", 0.0, 1.5, 0.2, 0.05, key="gs_temperature")
    top_p = st.sidebar.slider("Top-P (Nucleus)", 0.1, 1.0, 1.0, 0.05, key="gs_top_p")
    enable_k = st.sidebar.toggle("Enable Top-K", value=False, key="gs_enable_topk")
    top_k = st.sidebar.slider("Top-K", 1, 100, 40, key="gs_top_k", disabled=not enable_k)
    max_tokens = st.sidebar.slider("Max tokens", 64, 4096, 1024, 64, key="gs_max_tokens")
    enable_rep = st.sidebar.toggle("Enable repetition penalty", value=False, key="gs_enable_rep")
    rep_pen = (
        st.sidebar.slider("Repetition penalty (1.0 = none)", 1.0, 2.0, 1.15, 0.05, key="gs_rep")
        if enable_rep
        else None
    )
    return GenerationConfig(
        temperature=temperature,
        top_p=(top_p if top_p < 1.0 else None),
        top_k=(int(top_k) if enable_k else None),
        max_tokens=int(max_tokens),
        repetition_penalty=(float(rep_pen) if rep_pen else None),
    )


def render_sidebar() -> None:
    st.sidebar.header("Test Controls")
    st.sidebar.slider("Parallel bots", min_value=2, max_value=8, value=4, step=1, key="tb_bot_count")
    st.sidebar.toggle("Privacy redaction", value=True, key="tb_privacy")
    gen_cfg = render_generation_settings()
    st.session_state.generation_config = gen_cfg
    st.sidebar.caption("Providers")
    st.sidebar.code(format_provider_status(st.session_state.test_providers) or "(none)", language="text")

    if st.sidebar.button("Reload providers"):
        st.session_state.test_providers = build_provider_stack()
        st.sidebar.success("Providers reloaded.")
    if st.sidebar.button("Reload sources"):
        st.session_state.test_index.refresh()
        st.sidebar.success("Index refreshed.")
    if st.sidebar.button("Clear test log"):
        st.session_state.test_log = []
        st.sidebar.success("Cleared.")


def render_provider_header(providers: Sequence[ChatProvider]) -> None:
    st.markdown(f"### Providers ({len(providers)})")
    st.code(format_provider_status(providers) or "(none configured)", language="text")
    if not providers:
        st.error("No providers configured. Set OPENAI_API_KEYS / GEMINI_API_KEYS / MISTRAL_API_KEYS in the environment before running.")


def render_candidate_list(candidates: Sequence[Candidate]) -> None:
    if not candidates:
        st.info("No candidates returned.")
        return
    st.markdown("**Scored candidates**")
    st.dataframe(
        [
            {
                "bot": c.bot_name,
                "provider": c.provider_name,
                "total": round(c.total_score, 3),
                "source": round(c.source_score, 3),
                "bias": round(c.bias_score, 3),
                "clarity": round(c.clarity_score, 3),
            }
            for c in candidates
        ],
        use_container_width=True,
    )


def render_candidate_details(candidates: Sequence[Candidate]) -> None:
    if not candidates:
        return
    for i, c in enumerate(candidates, start=1):
        with st.expander(f"{i}. {c.bot_name} via {c.provider_name} — total={c.total_score:.3f}", expanded=False):
            st.markdown("**Raw response**")
            st.write(c.text)
            st.caption(f"source={c.source_score:.3f} · bias={c.bias_score:.3f} · clarity={c.clarity_score:.3f}")


def render_result(result: Dict, show_raw: bool) -> None:
    if result["error"]:
        st.error(f"Error: {result['error']}")
        return
    st.write("**Answer**")
    st.write(result["answer"])
    c = st.columns(4)
    c[0].metric("source", f"{result['source_score']:.3f}")
    c[1].metric("bias", f"{result['bias_score']:.3f}")
    c[2].metric("latency (s)", f"{result['latency']:.2f}")
    c[3].metric("redaction", ", ".join(result["redaction_hits"]) or "none")
    st.write("**Matched sources**")
    st.write(format_sources_for_user(result["sources"]))
    st.write("**Top candidate:**", result["top_candidate"])
    render_candidate_list(result["candidates"])
    if show_raw:
        render_candidate_details(result["candidates"])


def render_log_aggregate() -> None:
    log = st.session_state.test_log
    if not log:
        return
    st.markdown("---")
    st.subheader("Aggregate metrics")
    latencies = [e["latency"] for e in log if e["latency"] > 0 and not e["error"]]
    errors = [e for e in log if e["error"]]
    c = st.columns(4)
    c[0].metric("Runs", len(log))
    c[1].metric("Avg latency (s)", f"{sum(latencies) / len(latencies):.2f}" if latencies else "n/a")
    c[2].metric("P50 latency (s)", f"{percentile(latencies, 0.5):.2f}" if latencies else "n/a")
    c[3].metric("Errors", len(errors))

    if latencies:
        st.bar_chart({"latency (s)": latencies}, use_container_width=True)

    for e in log:
        status = "ERR" if e["error"] else "OK"
        label = f"[{status}] {e['prompt']}"
        if not e["error"]:
            label += f" — {e['latency']:.2f}s | src={e['source_score']:.2f} bias={e['bias_score']:.2f}"
        with st.expander(label, expanded=False):
            if e["error"]:
                st.error(e["error"])
            else:
                st.write("**Answer:**")
                st.write(e["answer"])
                st.write("**Top candidate:**", e["top_candidate"])
                st.write("**Sources:**")
                st.write(format_sources_for_user(e["sources"]))
                st.write("**Redaction hits on output:**", ", ".join(e["redaction_hits"]) or "none")


def app_main() -> None:
    st.set_page_config(page_title=APP_TITLE, layout="wide")
    init_state()
    render_sidebar()

    st.title(APP_TITLE)
    st.caption(APP_SUBTITLE)
    render_provider_header(st.session_state.test_providers)

    bot_count = int(st.session_state.tb_bot_count)
    privacy = bool(st.session_state.tb_privacy)
    gen_cfg = st.session_state.generation_config

    st.markdown("---")
    st.subheader("Single test")
    prompt = st.text_input("Prompt", key="tb_prompt", help="Ask one question to test against the ensemble.")
    show_raw = st.checkbox("Show per-candidate raw data", value=True)
    if st.button("Run test", type="primary"):
        if not prompt.strip():
            st.warning("Enter a prompt first.")
        else:
            with st.spinner("Running ensemble..."):
                result = run_one(prompt.strip(), bot_count, privacy, gen_cfg)
            render_result(result, show_raw)
            st.session_state.test_log.append(result)

    st.markdown("---")
    st.subheader("Batch test")
    batch = st.text_area(
        "One prompt per line",
        key="batch_prompts",
        height=140,
        help="Each non-empty line is run as an independent ensemble test.",
    )
    if st.button("Run batch"):
        prompts = [line.strip() for line in batch.splitlines() if line.strip()]
        if not prompts:
            st.warning("No prompts found.")
        else:
            progress = st.progress(0.0)
            for i, q in enumerate(prompts, start=1):
                with st.spinner(f"Running {i}/{len(prompts)}: {q}"):
                    result = run_one(q, bot_count, privacy, gen_cfg)
                st.session_state.test_log.append(result)
                with st.expander(f"[{i}] {q}"):
                    if result["error"]:
                        st.error(result["error"])
                    else:
                        st.write(result["answer"])
                progress.progress(i / len(prompts))
            st.success("Batch complete.")

    render_log_aggregate()


if __name__ == "__main__":
    app_main()
