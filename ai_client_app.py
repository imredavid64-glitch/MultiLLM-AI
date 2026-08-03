from __future__ import annotations

import queue
import shutil
import threading
from pathlib import Path
from typing import Dict, List, Sequence

import tkinter as tk
from tkinter import filedialog, messagebox, ttk
"""
OPENAI API KEY used from OPENROUTER, and a GEMINI API KEY used from GOOGLE AI STUDIO
"""
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
    detect_sensitive_hits,
    format_provider_status,
    format_sources_for_user,
    source_support_score,
)


class HydraDesktopApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Multi LLM Desktop")
        self.geometry("1280x820")
        self.minsize(980, 700)

        self.providers: List[ChatProvider] = build_provider_stack()
        self.source_index = SourceIndex(SOURCES_DIR)
        self.source_index.refresh()
        self.chat_history: List[Dict[str, str]] = []
        self.result_queue: queue.Queue = queue.Queue()

        self.bot_count_var = tk.IntVar(value=max(3, len(self.providers) or 3))
        self.privacy_var = tk.BooleanVar(value=True)
        self.save_history_var = tk.BooleanVar(value=True)

        self._build_style()
        self._build_layout()
        self._refresh_provider_panel()
        self._refresh_source_panel()
        self._append_status("Desktop app started. Ready.")

        self.after(120, self._poll_results)

    def _build_style(self) -> None:
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except Exception:
            pass
        bg = "#f2eadc"
        panel = "#fff6e6"
        ink = "#101827"
        line = "#d6c9b4"
        accent = "#0f766e"

        self.configure(bg=bg)
        style.configure("TFrame", background=bg)
        style.configure("Panel.TFrame", background=panel, borderwidth=1, relief="solid")
        style.configure("TLabel", background=bg, foreground=ink)
        style.configure("Heading.TLabel", background=bg, foreground=ink, font=("Helvetica", 18, "bold"))
        style.configure("Sub.TLabel", background=bg, foreground="#334155", font=("Helvetica", 10))
        style.configure("TButton", padding=6)
        style.configure("Accent.TButton", foreground=accent)
        style.configure("TCheckbutton", background=panel, foreground=ink)

    def _build_layout(self) -> None:
        root = ttk.Frame(self, padding=10)
        root.pack(fill="both", expand=True)

        header = ttk.Frame(root)
        header.pack(fill="x")
        ttk.Label(header, text="Multi LLM", style="Heading.TLabel").pack(anchor="w")
        ttk.Label(
            header,
            text="Native desktop client with parallel multi-provider bots and local source checks.",
            style="Sub.TLabel",
        ).pack(anchor="w", pady=(2, 8))

        main_pane = ttk.Panedwindow(root, orient="horizontal")
        main_pane.pack(fill="both", expand=True)

        left = ttk.Frame(main_pane, style="Panel.TFrame", padding=10)
        right = ttk.Frame(main_pane, style="Panel.TFrame", padding=10)
        main_pane.add(left, weight=30)
        main_pane.add(right, weight=70)

        self._build_left_panel(left)
        self._build_right_panel(right)

    def _build_left_panel(self, parent: ttk.Frame) -> None:
        settings = ttk.LabelFrame(parent, text="Settings")
        settings.pack(fill="x", pady=(0, 8))

        ttk.Label(settings, text="Parallel bots").grid(row=0, column=0, sticky="w", padx=6, pady=6)
        spin = ttk.Spinbox(settings, from_=2, to=8, width=5, textvariable=self.bot_count_var)
        spin.grid(row=0, column=1, sticky="w", padx=6, pady=6)
        ttk.Checkbutton(settings, text="Privacy redaction", variable=self.privacy_var).grid(
            row=1, column=0, columnspan=2, sticky="w", padx=6, pady=4
        )
        ttk.Checkbutton(settings, text="Save chat in memory", variable=self.save_history_var).grid(
            row=2, column=0, columnspan=2, sticky="w", padx=6, pady=4
        )
        ttk.Button(settings, text="Reload Providers", command=self._reload_providers).grid(
            row=3, column=0, sticky="ew", padx=6, pady=6
        )
        ttk.Button(settings, text="Clear Chat", command=self._clear_chat).grid(
            row=3, column=1, sticky="ew", padx=6, pady=6
        )
        settings.columnconfigure(0, weight=1)
        settings.columnconfigure(1, weight=1)

        provider_frame = ttk.LabelFrame(parent, text="Providers")
        provider_frame.pack(fill="both", expand=False, pady=(0, 8))
        self.provider_text = tk.Text(provider_frame, height=8, wrap="word", bg="#fffdf7", relief="flat")
        self.provider_text.pack(fill="both", expand=True, padx=6, pady=6)
        self.provider_text.configure(state="disabled")

        source_frame = ttk.LabelFrame(parent, text="Knowledge Sources")
        source_frame.pack(fill="both", expand=True, pady=(0, 8))

        source_buttons = ttk.Frame(source_frame)
        source_buttons.pack(fill="x", padx=6, pady=(6, 4))
        ttk.Button(source_buttons, text="Upload Files", command=self._upload_sources).pack(side="left")
        ttk.Button(source_buttons, text="Reload Index", command=self._reload_sources).pack(side="left", padx=6)

        self.source_listbox = tk.Listbox(source_frame, bg="#fffdf7", relief="flat")
        self.source_listbox.pack(fill="both", expand=True, padx=6, pady=(0, 6))

        status_frame = ttk.LabelFrame(parent, text="Status")
        status_frame.pack(fill="both", expand=False)
        self.status_text = tk.Text(status_frame, height=8, wrap="word", bg="#fffdf7", relief="flat")
        self.status_text.pack(fill="both", expand=True, padx=6, pady=6)
        self.status_text.configure(state="disabled")

    def _build_right_panel(self, parent: ttk.Frame) -> None:
        chat_frame = ttk.LabelFrame(parent, text="Conversation")
        chat_frame.pack(fill="both", expand=True)

        self.chat_text = tk.Text(chat_frame, wrap="word", bg="#fffefb", relief="flat")
        self.chat_text.pack(fill="both", expand=True, padx=6, pady=6)
        self.chat_text.configure(state="disabled")
        self.chat_text.tag_configure("user", foreground="#0f172a", font=("Helvetica", 11, "bold"))
        self.chat_text.tag_configure("assistant", foreground="#0b3d33", font=("Helvetica", 11, "bold"))
        self.chat_text.tag_configure("content", foreground="#1f2937", font=("Helvetica", 11))
        self.chat_text.tag_configure("meta", foreground="#475569", font=("Menlo", 10))

        input_frame = ttk.Frame(parent)
        input_frame.pack(fill="x", pady=(8, 0))
        self.input_entry = ttk.Entry(input_frame)
        self.input_entry.pack(side="left", fill="x", expand=True, padx=(0, 8))
        self.input_entry.bind("<Return>", self._on_send_event)
        self.send_btn = ttk.Button(input_frame, text="Send", style="Accent.TButton", command=self._on_send)
        self.send_btn.pack(side="left")
        self.input_entry.focus_set()

    def _append_status(self, line: str) -> None:
        self.status_text.configure(state="normal")
        self.status_text.insert("end", f"{line}\n")
        self.status_text.see("end")
        self.status_text.configure(state="disabled")

    def _append_chat_block(self, role: str, content: str) -> None:
        self.chat_text.configure(state="normal")
        if role == "You":
            self.chat_text.insert("end", "You:\n", "user")
        else:
            self.chat_text.insert("end", "AI:\n", "assistant")
        self.chat_text.insert("end", f"{content}\n\n", "content")
        self.chat_text.see("end")
        self.chat_text.configure(state="disabled")

    def _append_meta_block(self, lines: Sequence[str]) -> None:
        self.chat_text.configure(state="normal")
        for line in lines:
            self.chat_text.insert("end", f"{line}\n", "meta")
        self.chat_text.insert("end", "\n", "meta")
        self.chat_text.see("end")
        self.chat_text.configure(state="disabled")

    def _refresh_provider_panel(self) -> None:
        status = format_provider_status(self.providers) if self.providers else "(no providers loaded)"
        self.provider_text.configure(state="normal")
        self.provider_text.delete("1.0", "end")
        self.provider_text.insert("1.0", status)
        self.provider_text.configure(state="disabled")

    def _refresh_source_panel(self) -> None:
        self.source_listbox.delete(0, "end")
        for path in self.source_index.loaded_files:
            self.source_listbox.insert("end", str(path))
        if not self.source_index.loaded_files:
            self.source_listbox.insert("end", f"No files loaded. Add files to {SOURCES_DIR}")

    def _set_busy(self, is_busy: bool) -> None:
        state = "disabled" if is_busy else "normal"
        self.send_btn.configure(state=state)
        self.input_entry.configure(state=state)

    def _reload_providers(self) -> None:
        self.providers = build_provider_stack()
        self._refresh_provider_panel()
        if self.providers:
            self._append_status(f"Providers reloaded: {len(self.providers)}")
        else:
            self._append_status("No providers loaded. Check API keys.")

    def _reload_sources(self) -> None:
        self.source_index.refresh()
        self._refresh_source_panel()
        self._append_status(
            f"Source index reloaded: {len(self.source_index.loaded_files)} files, {len(self.source_index.chunks)} chunks."
        )

    def _upload_sources(self) -> None:
        filetypes = [(f"*{ext}", f"*{ext}") for ext in sorted(ALLOWED_SOURCE_EXTENSIONS)]
        paths = filedialog.askopenfilenames(title="Select source files", filetypes=filetypes)
        if not paths:
            return

        SOURCES_DIR.mkdir(parents=True, exist_ok=True)
        copied = 0
        skipped = 0
        for raw_path in paths:
            src = Path(raw_path)
            if src.suffix.lower() not in ALLOWED_SOURCE_EXTENSIONS:
                skipped += 1
                continue
            dest = SOURCES_DIR / src.name
            try:
                if src.resolve() != dest.resolve():
                    shutil.copy2(src, dest)
                copied += 1
            except Exception:
                skipped += 1

        self._reload_sources()
        self._append_status(f"Uploaded {copied} file(s), skipped {skipped}.")

    def _clear_chat(self) -> None:
        self.chat_history = []
        self.chat_text.configure(state="normal")
        self.chat_text.delete("1.0", "end")
        self.chat_text.configure(state="disabled")
        self._append_status("Chat cleared.")

    def _on_send_event(self, _event) -> None:
        self._on_send()

    def _on_send(self) -> None:
        prompt = self.input_entry.get().strip()
        if not prompt:
            return
        if not self.providers:
            messagebox.showerror("No providers", "No providers loaded. Reload providers and check API keys.")
            return

        self.input_entry.delete(0, "end")
        self._append_chat_block("You", prompt)

        if not self.privacy_var.get() and detect_sensitive_hits(prompt):
            self._append_status("Warning: sensitive pattern found in prompt while privacy redaction is OFF.")

        self._set_busy(True)
        thread = threading.Thread(target=self._run_inference, args=(prompt,), daemon=True)
        thread.start()

    def _run_inference(self, prompt: str) -> None:
        try:
            bot_count = max(2, min(8, int(self.bot_count_var.get())))
            sources: List[SourceChunk] = self.source_index.retrieve(prompt)
            answer, candidates = build_ensemble_answer(
                providers=self.providers,
                history=self.chat_history,
                user_input=prompt,
                sources=sources,
                bot_count=bot_count,
                privacy_redaction=self.privacy_var.get(),
            )
            payload = {
                "ok": True,
                "prompt": prompt,
                "answer": answer,
                "sources": sources,
                "candidates": candidates,
            }
            self.result_queue.put(payload)
        except Exception as exc:
            self.result_queue.put({"ok": False, "error": str(exc)})

    def _poll_results(self) -> None:
        try:
            while True:
                item = self.result_queue.get_nowait()
                if item.get("ok"):
                    self._handle_success(item)
                else:
                    self._handle_error(item.get("error", "Unknown error"))
        except queue.Empty:
            pass
        finally:
            self.after(120, self._poll_results)

    def _handle_success(self, item: Dict) -> None:
        prompt = item["prompt"]
        answer = item["answer"]
        sources: List[SourceChunk] = item["sources"]
        candidates: List[Candidate] = item["candidates"]

        self._append_chat_block("AI", answer)

        src_score = source_support_score(answer, sources)
        b_score = bias_score(answer)
        leak = "OK" if not detect_sensitive_hits(answer) else "REDACTED"
        top = candidates[0] if candidates else None
        top_line = (
            f"top candidate: {top.bot_name} via {top.provider_name} (score={top.total_score:.2f})"
            if top
            else "top candidate: n/a"
        )
        meta_lines = [
            "Checks:",
            f"- {top_line}",
            f"- source support score: {src_score:.2f}",
            f"- bias score: {b_score:.2f}",
            f"- leakage scan: {leak}",
            "- sources:",
            format_sources_for_user(sources),
        ]
        self._append_meta_block(meta_lines)

        if self.save_history_var.get():
            self.chat_history.append({"role": "user", "content": prompt})
            self.chat_history.append({"role": "assistant", "content": answer})

        self._append_status("Response complete.")
        self._set_busy(False)

    def _handle_error(self, error: str) -> None:
        self._append_status(f"Error: {error}")
        self._append_meta_block([f"Error: {error}"])
        self._set_busy(False)


def main() -> None:
    app = HydraDesktopApp()
    app.mainloop()


if __name__ == "__main__":
    main()
