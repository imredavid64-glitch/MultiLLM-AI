// Multi-LLM Runtime JavaScript Implementation
// Part of the Unified Sustainable AI Ecosystem

class GenerationConfig {
    constructor(options = {}) {
        this.temperature = options.temperature || 0.2;
        this.top_p = options.top_p || null;
        this.top_k = options.top_k || null;
        this.max_tokens = options.max_tokens || null;
        this.repetition_penalty = options.repetition_penalty || null;
    }
}

class SustainabilityMetrics {
    constructor(data = {}) {
        this.timestamp = data.timestamp || new Date().toISOString();
        this.query = data.query || '';
        this.accuracy = data.accuracy || 0;
        this.bias = data.bias || 0;
        this.emissions_g = data.emissions_g || 0;
        this.water_l = data.water_l || 0;
        this.carbon_saved_g = data.carbon_saved_g || 0;
        this.latency_s = data.latency_s || 0;
        this.user_preference = data.user_preference || '';
    }
}

class ChatProvider {
    constructor() {
        if (new.target === ChatProvider) {
            throw new Error('Abstract class ChatProvider cannot be instantiated directly');
        }
    }

    get_name() {
        throw new Error('Method get_name() must be implemented');
    }

    get_model() {
        throw new Error('Method get_model() must be implemented');
    }

    get_size() {
        throw new Error('Method get_size() must be implemented');
    }

    chat(messages, config) {
        throw new Error('Method chat() must be implemented');
    }
}

class OpenAIProvider extends ChatProvider {
    constructor(api_keys, model, base_url = '') {
        super();
        this.name = 'OpenRouter (OpenAI API)' + (base_url.includes('openrouter.ai') ? '' : ' (OpenAI-compatible)');
        this.model = model;
        this.base_url = base_url.trim();
        this._clients = [];
        for (const key of api_keys) {
            const kwargs = { api_key: key };
            if (this.base_url) {
                kwargs.base_url = this.base_url;
            }
            this._clients.push(new OpenAI(kwargs));
        }
        this._cursor = 0;
        this._lock = new Mutex();
    }

    get_name() { return this.name; }
    get_model() { return this.model; }
    get_size() { return this._clients.length; }

    chat(messages, config) {
        const last_error = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            const client = this._next_client();
            try {
                const response = client.chat.completions.create({
                    model: this.model,
                    messages: messages,
                    temperature: config.temperature,
                    max_tokens: config.max_tokens,
                    top_p: config.top_p,
                    frequency_penalty: config.repetition_penalty,
                    presence_penalty: 0
                });
                const text = this._extract_text(response);
                if (text) return text;
                last_error = new Error('Empty response from OpenAI-compatible provider');
            } catch (error) {
                last_error = error;
                if (attempt < 3) setTimeout(() => {}, 2 ** attempt * 1000);
            }
        }
        throw new Error(`${this.name} call failed after retries: ${last_error.message}`);
    }

    _next_client() {
        this._lock.acquire();
        try {
            const client = this._clients[this._cursor % this._clients.length];
            this._cursor++;
            return client;
        } finally {
            this._lock.release();
        }
    }

    _extract_text(response) {
        try {
            const message = response.choices[0].message;
            let content = message.content || '';
            if (typeof content === 'string') return content.trim();
            if (Array.isArray(content)) {
                const parts = [];
                for (const block of content) {
                    if (block.text) parts.push(block.text);
                }
                return parts.join('\n').trim();
            }
            return String(content).trim();
        } catch (error) {
            return '';
        }
    }
}

class GeminiProvider extends ChatProvider {
    constructor(api_keys, model) {
        super();
        this.name = 'Google Gemini';
        this.model = model;
        this._keys = new RoundRobinKeys(api_keys);
        this._model_candidates = this._build_model_candidates(model);
        this._current_model = model;
    }

    get_name() { return this.name; }
    get_model() { return this.model; }
    get_size() { return this._keys.size(); }

    async chat(messages, config) {
        const prompt = this._flatten_messages(messages);
        let last_error = null;

        for (const candidate_model of this._model_candidates) {
            const encoded_model = encodeURIComponent(candidate_model);
            for (let attempt = 0; attempt < 4; attempt++) {
                const key = this._keys.next();
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${encoded_model}:generateContent?key=${encodeURIComponent(key)}`;

                const payload = {
                    contents: [{ role: 'user', parts: [{ text: prompt }]}]
                };
                if (config.temperature !== 0.2) {
                    payload.generationConfig = { temperature: config.temperature };
                }

                try {
                    const data = await this._http_post_json(url, payload, { 'Content-Type': 'application/json' });
                    const text = this._extract_gemini_text(data);
                    if (text) {
                        this._current_model = candidate_model;
                        return text;
                    }
                    last_error = new Error('Empty response from Gemini provider');
                } catch (error) {
                    last_error = error;
                    if (error.message.includes('HTTP 404') && error.message.includes('models/')) {
                        break;
                    }
                    if (error.message.includes('HTTP 429') || error.message.includes('HTTP 401') || error.message.includes('HTTP 403')) {
                        break;
                    }
                    if (attempt < 3) setTimeout(() => {}, 2 ** attempt * 1000);
                }
            }
        }

        throw new Error(`${this.name} call failed after retries: ${last_error.message}`);
    }

    _build_model_candidates(primary_model) {
        const candidates = [
            primary_model,
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-2.0-flash',
            'gemini-2.0-flash-lite',
            'gemini-1.5-flash',
            'gemini-1.5-pro'
        ];

        const deduped = new Set();
        const result = [];
        for (const item of candidates) {
            const normalized = item.trim();
            if (normalized && !deduped.has(normalized)) {
                deduped.add(normalized);
                result.push(normalized);
            }
        }
        return result;
    }

    _flatten_messages(messages) {
        const lines = [];
        for (const msg of messages) {
            const role = msg.role.toUpperCase();
            const content = msg.content || '';
            if (content) {
                lines.push(`${role}: ${content}`);
            }
        }
        return lines.join('\n\n');
    }

    async _http_post_json(url, payload, headers) {
        if (typeof window !== 'undefined') {
            return await this._fetch_with_timeout(url, 'POST', payload, headers);
        }
        const httpx = await import('httpx');
        return await httpx.post(url, payload, { headers, timeout: 45000 });
    }

    async _fetch_with_timeout(url, method, payload, headers) {
        const response = await fetch(url, {
            method,
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(45000)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text.substring(0, 360)}`);
        }

        const text = await response.text();
        return text ? JSON.parse(text) : {};
    }

    _extract_gemini_text(data) {
        const candidates = data.candidates || [];
        if (!candidates.length) return '';

        const content = candidates[0].content || {};
        const parts = content.parts || [];
        const texts = parts
            .filter(part => typeof part === 'object' && part.text)
            .map(part => part.text);

        return texts.join('\n').trim();
    }
}

class MistralProvider extends ChatProvider {
    constructor(api_keys, model) {
        super();
        this.name = 'Mistral';
        this.model = model;
        this._keys = new RoundRobinKeys(api_keys);
    }

    get_name() { return this.name; }
    get_model() { return this.model; }
    get_size() { return this._keys.size(); }

    async chat(messages, config) {
        let last_error = null;
        for (let attempt = 0; attempt < 4; attempt++) {
            const key = this._keys.next();
            const payload = {
                model: this.model,
                messages: messages,
                temperature: config.temperature,
                top_p: config.top_p,
                top_k: config.top_k,
                max_tokens: config.max_tokens,
                presence_penalty: config.repetition_penalty,
                frequency_penalty: 0
            };

            try {
                const data = await this._http_post_json(
                    'https://api.mistral.ai/v1/chat/completions',
                    payload,
                    {
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json'
                    }
                );
                const text = this._extract_mistral_text(data);
                if (text) return text;
                last_error = new Error('Empty response from Mistral provider');
            } catch (error) {
                last_error = error;
                if (attempt < 3) setTimeout(() => {}, 2 ** attempt * 1000);
            }
        }
        throw new Error(`${this.name} call failed after retries: ${last_error.message}`);
    }

    async _http_post_json(url, payload, headers) {
        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(45000)
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text.substring(0, 360)}`);
        }

        const text = await response.text();
        return text ? JSON.parse(text) : {};
    }

    _extract_mistral_text(data) {
        const choices = data.choices || [];
        if (!choices.length) return '';

        const message = choices[0].message || {};
        let content = message.content || '';

        if (typeof content === 'string') return content.trim();
        if (Array.isArray(content)) {
            const texts = content
                .filter(item => typeof item === 'object' && item.text)
                .map(item => item.text);
            return texts.join('\n').trim();
        }
        return String(content).trim();
    }
}

class RoundRobinKeys {
    constructor(keys) {
        this._keys = Array.isArray(keys) ? keys : [];
        this._cursor = 0;
        this._lock = new Mutex();
    }

    next() {
        return this._lock.execute(() => {
            const key = this._keys[this._cursor % this._keys.length];
            this._cursor++;
            return key;
        });
    }

    size() {
        return this._keys.length;
    }
}

class Mutex {
    constructor() {
        this._locks = new Set();
        this._queue = [];
    }

    async execute(fn) {
        return new Promise((resolve, reject) => {
            this._queue.push({ fn, resolve, reject });
            this._process();
        });
    }

    _process() {
        if (this._locks.size === 0 && this._queue.length > 0) {
            const { fn, resolve, reject } = this._queue.shift();
            this._locks.add('processing');
            Promise.resolve(fn()).then(
                result => {
                    this._locks.delete('processing');
                    resolve(result);
                    this._process();
                },
                error => {
                    this._locks.delete('processing');
                    reject(error);
                    this._process();
                }
            );
        }
    }
}

class MultiLLM {
    constructor() {
        this.providers = [];
    }

    async load_providers() {
        try {
            const env = await this._load_env_file();
            const openai_keys = this._load_keys_from_env(
                'OPENAI_API_KEYS',
                'OPENAI_API_KEY',
                'OPENAI_API_KEYS_FILE'
            );
            if (openai_keys.length > 0) {
                const base_url = this._infer_openai_base_url(openai_keys);
                const openai_model = this._get_env('OPENAI_MODEL') || 
                    (base_url.includes('openrouter.ai') ? 'openai/gpt-4o-mini' : 'gpt-4o-mini');
                this.providers.push(new OpenAIProvider(openai_keys, openai_model, base_url));
            }

            const gemini_keys = this._load_keys_from_env(
                'GEMINI_API_KEYS',
                'GEMINI_API_KEY',
                'GEMINI_API_KEYS_FILE'
            );
            if (gemini_keys.length > 0) {
                const gemini_model = this._get_env('GEMINI_MODEL') || 'gemini-2.5-flash';
                this.providers.push(new GeminiProvider(gemini_keys, gemini_model));
            }

            const mistral_keys = this._load_keys_from_env(
                'MISTRAL_API_KEYS',
                'MISTRAL_API_KEY',
                'MISTRAL_API_KEYS_FILE'
            );
            if (mistral_keys.length > 0) {
                const mistral_model = this._get_env('MISTRAL_MODEL') || 'mistral-small-latest';
                this.providers.push(new MistralProvider(mistral_keys, mistral_model));
            }
        } catch (error) {
            console.error('Failed to load providers:', error);
            throw error;
        }
    }

    async query(question, config = new GenerationConfig()) {
        if (this.providers.length === 0) {
            throw new Error('No providers configured. Set API keys in environment variables.');
        }

        const start = Date.now();
        const sources = await this._retrieve(question);
        const answer = await this._build_ensemble_answer(
            this.providers,
            [],
            question,
            sources,
            4,
            true,
            config
        );
        const latency = (Date.now() - start) / 1000;

        const metrics = new SustainabilityMetrics({
            query: question,
            emissions_g: this._calculate_emissions(),
            latency_s: latency
        });

        return { answer, metrics };
    }

    static get_provider_status() {
        return 'Provider status available via Python implementation';
    }

    _load_env_file() {
        return new Promise((resolve, reject) => {
            const fs = require('fs');
            const path = require('path');
            const base_dir = path.dirname(require.main.filename);
            const env_path = path.join(base_dir, '.env');

            if (!fs.existsSync(env_path)) {
                resolve({});
                return;
            }

            try {
                const content = fs.readFileSync(env_path, 'utf8');
                const env = {};
                for (const line of content.split('\n')) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                        const [key, ...value_parts] = trimmed.split('=');
                        const value = value_parts.join('=').trim();
                        if (key && value) {
                            env[key.trim()] = value.trim().replace(/^["']|['"]$/g, '');
                        }
                    }
                }
                resolve(env);
            } catch (error) {
                reject(error);
            }
        });
    }

    _load_keys_from_env(multi_env, single_env, file_env) {
        const keys = [];
        const env = process.env;

        const multi_value = env[multi_env];
        if (multi_value) {
            keys.push(...multi_value.split(',').map(k => k.trim()));
        }

        const single_value = env[single_env];
        if (single_value) {
            keys.push(single_value.trim());
        }

        if (file_env && env[file_env]) {
            try {
                const fs = require('fs');
                const key_file = fs.readFileSync(env[file_env], 'utf8');
                const lines = key_file.split('\n');
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#')) {
                        keys.push(trimmed);
                    }
                }
            } catch (error) {
                console.error(`Failed to load keys from ${file_env}:`, error);
            }
        }

        return Array.from(new Set(keys));
    }

    _get_env(key) {
        return process.env[key];
    }

    _infer_openai_base_url(keys) {
        const explicit = this._get_env('OPENAI_BASE_URL');
        if (explicit) return explicit;
        if (keys && keys.every(key => key.startsWith('sk-or-v1-'))) {
            return 'https://openrouter.ai/api/v1';
        }
        return '';
    }

    async _retrieve(query, top_k = 6) {
        return [];
    }

    async _build_ensemble_answer(providers, history, user_input, sources, bot_count, privacy_redaction, config) {
        const source_context = this._format_sources_for_prompt(sources);
        const bot_configs = this._select_bot_configs(bot_count);

        if (providers.length === 0) {
            throw new Error('No providers configured');
        }

        const candidates = [];
        const executor = require('concurrent.futures').ThreadPoolExecutor;
        const executor_instance = new executor({ max_workers: bot_count });

        try {
            const futures = [];
            for (let idx = 0; idx < bot_configs.length; idx++) {
                const [bot_name, instruction] = bot_configs[idx];
                const provider_index = idx % providers.length;
                const provider = providers[provider_index];

                const future = executor_instance.submit(async () => {
                    return await this._generate_candidate(
                        provider, history, user_input, source_context,
                        bot_name, instruction, privacy_redaction, config
                    );
                });

                futures.push({ future, bot_name, provider_index });
            }

            const results = [];
            for (const { future, bot_name, provider_index } of futures) {
                try {
                    const candidate = await future;
                    results.push({ candidate, bot_name, provider_index });
                } catch (error) {
                    console.error(`Bot ${bot_name} failed:`, error);
                }
            }

            for (const { candidate, bot_name, provider_index } of results) {
                const provider_name = providers[provider_index].get_name();
                const s_score = this._source_support_score(candidate.text, sources);
                const b_score = this._bias_score(candidate.text);
                const c_score = this._clarity_score(candidate.text);
                const total = (0.5 * s_score) + (0.25 * b_score) + (0.25 * c_score);

                candidates.push({
                    bot_name,
                    provider_name,
                    provider_index,
                    text: candidate.text,
                    source_score: s_score,
                    bias_score: b_score,
                    clarity_score: c_score,
                    total_score: total
                });
            }

            candidates.sort((a, b) => b.total_score - a.total_score);
            const top_candidates = candidates.slice(0, 3);

            if (top_candidates.length === 0) {
                throw new Error('All provider calls failed');
            }

            const synthesis_provider = providers[top_candidates[0].provider_index];
            const synthesis_prompt = this._build_synthesis_prompt(
                top_candidates, user_input, privacy_redaction
            );

            const synthesis_messages = [
                { role: 'system', content: 'Produce one final, practical, unbiased answer.' },
                { role: 'user', content: synthesis_prompt }
            ];

            let final_answer;
            try {
                const synthesis_gen = new GenerationConfig({
                    temperature: 0.1,
                    max_tokens: config.max_tokens
                });
                final_answer = await synthesis_provider.chat(synthesis_messages, synthesis_gen);
            } catch (error) {
                final_answer = top_candidates[0].text;
            }

            if (this._detect_sensitive_hits(final_answer)) {
                final_answer = this._redact_sensitive(final_answer);
            }

            return { answer: final_answer, candidates: top_candidates };
        } finally {
            executor_instance.shutdown();
        }
    }

    async _generate_candidate(provider, history, user_input, source_context, bot_name, bot_instruction, privacy_redaction, config) {
        const safe_user_input = privacy_redaction ? 
            this._redact_sensitive(user_input) : user_input;

        const recent_history = history.slice(-12);
        const processed_history = privacy_redaction ? 
            recent_history.map(msg => ({
                role: msg.role,
                content: this._redact_sensitive(msg.content)
            })) : recent_history;

        const system_prompt = `${this._system_prompt_base}
Persona: ${bot_name}. ${bot_instruction}
Keep final answer practical and concise.`;

        const task_prompt = `User request: ${safe_user_input}

Local sources: ${source_context}

Answer rules:
- Use citations [S#] for factual statements when possible.
- If a fact is unsupported, label it as uncertain.
- Avoid one-sided framing. Present tradeoffs.
- Do not reveal sensitive identifiers.`;

        const messages = [
            { role: 'system', content: system_prompt },
            ...processed_history,
            { role: 'user', content: task_prompt }
        ];

        return await provider.chat(messages, config);
    }

    _system_prompt_base = `You are one bot inside a multi-bot answer ensemble.
Goals:
1) Be accurate and honest about uncertainty.
2) Reduce bias by presenting balanced alternatives.
3) Cite provided local source ids like [S1], [S2] whenever factual claims are made.
4) If source support is weak, say what is uncertain instead of guessing.
5) Never output secrets or private identifiers.`;

    _build_synthesis_prompt(top_candidates, user_input, privacy_redaction) {
        const safe_input = privacy_redaction ? this._redact_sensitive(user_input) : user_input;
        let synthesis_prompt = `You are the final judge. Merge the best parts of candidate answers into one superior response.\nRules:\n- Keep only claims with source support or mark as uncertain.\n- Preserve balanced framing to reduce bias.\n- Keep citations like [S1] when factual claims are retained.\n- If candidates conflict, explain the conflict briefly.\n\nUser question: ${safe_input}\n\nCandidate answers:\n`;

        for (let idx = 0; idx < top_candidates.length; idx++) {
            const item = top_candidates[idx];
            synthesis_prompt += `Candidate ${idx + 1} (${item.bot_name}, provider=${item.provider_name}, score=${item.total_score.toFixed(2)}):\n${item.text}\n\n`;
        }

        return synthesis_prompt;
    }

    _source_support_score(answer, sources) {
        if (!answer) return 0.0;
        if (!sources.length) return 0.55;

        const source_token_sets = sources.map(chunk => this._tokenize(chunk.text));
        const sentences = answer.split(/[.!?]\s+/).filter(s => s.length > 25);
        if (!sentences.length) return 0.5;

        let supported = 0;
        for (const sentence of sentences) {
            const sentence_tokens = new Set(this._tokenize(sentence));
            if (!sentence_tokens.size) continue;

            let best_overlap = 0.0;
            for (const token_set of source_token_sets) {
                const overlap = Array.from(sentence_tokens).filter(token => token_set.has(token)).length / 
                    Math.max(1, sentence_tokens.size);
                if (overlap > best_overlap) best_overlap = overlap;
            }

            const has_citation = /\[S\d+\]/.test(sentence);
            if (best_overlap >= 0.18 || has_citation) {
                supported++;
            }
        }

        return supported / Math.max(1, sentences.length);
    }

    _bias_score(answer) {
        if (!answer) return 0.0;
        const words = answer.toLowerCase().match(/\w+/g) || [];
        if (!words.length) return 0.5;

        const absolute_words = ['always', 'never', 'everyone', 'nobody', 'guaranteed', 
                               'obviously', 'undeniable', 'proves', 'must'];
        const stopwords = ['the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 
                          'have', 'will', 'would', 'what', 'when', 'where', 'which', 
                          'about', 'there', 'their', 'them', 'into', 'than', 'then', 
                          'because', 'while', 'after', 'before'];

        const tokens = words.filter(word => !stopwords.includes(word));
        const abs_hits = tokens.filter(word => absolute_words.includes(word)).length;
        const citation_hits = (answer.match(/\[S\d+\]/g) || []).length;

        const penalty = 0.07 * abs_hits;
        const bonus = Math.min(0.25, 0.03 * citation_hits);
        return Math.max(0.0, Math.min(1.0, 0.75 - penalty + bonus));
    }

    _clarity_score(answer) {
        const words = answer.split();
        const word_count = words.length;
        let length_score = 0.5;
        if (word_count >= 35 && word_count <= 280) {
            length_score = 1.0;
        } else if (word_count <= 500) {
            length_score = 0.75;
        }

        const structure_bonus = ('\n-' in answer || '\n1.' in answer) ? 1.0 : 0.85;
        return Math.max(0.0, Math.min(1.0, 0.7 * length_score + 0.3 * structure_bonus));
    }

    _tokenize(text) {
        const words = text.toLowerCase().match(/\w+/g) || [];
        const stopwords = ['the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 
                          'have', 'will', 'would', 'what', 'when', 'where', 'which', 
                          'about', 'there', 'their', 'them', 'into', 'than', 'then', 
                          'because', 'while', 'after', 'before'];
        return words.filter(word => !stopwords.includes(word));
    }

    _format_sources_for_prompt(sources) {
        if (!sources.length) return 'No local sources available.';
        return sources.map((item, index) => 
            `[S${index + 1}] ${item.path.name}: ${item.text.substring(0, 700)}`
        ).join('\n');
    }

    _redact_sensitive(text) {
        let sanitized = text;
        const patterns = [
            { label: 'OpenAI key', regex: /sk-[A-Za-z0-9_-]{20,}/ },
            { label: 'Email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
            { label: 'US SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
            { label: 'Credit card', regex: /\b(?:\d[ -]*?){13,16}\b/ },
            { label: 'Phone', regex: /\b(?:\+\d{1,3}[ -]?)?(\(?\d{2,4}\)?[ -]?)?\d{3,4}[ -]?\d{4}\b/ }
        ];

        for (const { label, regex } of patterns) {
            sanitized = sanitized.replace(regex, `[REDACTED:${label.toUpperCase().replace(' ', '_')}]`);
        }
        return sanitized;
    }

    _detect_sensitive_hits(text) {
        const hits = [];
        const patterns = [
            { label: 'OpenAI key', regex: /sk-[A-Za-z0-9_-]{20,}/ },
            { label: 'Email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
            { label: 'US SSN', regex: /\b\d{3}-\d{2}-\d{4}\b/ },
            { label: 'Credit card', regex: /\b(?:\d[ -]*?){13,16}\b/ },
            { label: 'Phone', regex: /\b(?:\+\d{1,3}[ -]?)?(\(?\d{2,4}\)?[ -]?)?\d{3,4}[ -]?\d{4}\b/ }
        ];

        for (const { label, regex } of patterns) {
            if (regex.test(text)) hits.push(label);
        }
        return hits;
    }

    _select_bot_configs(bot_count) {
        const bot_personas = [
            ['Factual Analyst', 'Prioritize precise facts and explicit assumptions.'],
            ['Skeptical Reviewer', 'Challenge weak claims and point out uncertainty.'],
            ['Neutral Teacher', 'Explain clearly for non-experts with minimal jargon.'],
            ['Risk Auditor', 'Look for safety, privacy, and compliance risks.'],
            ['Counter-Bias Bot', 'Actively detect one-sided framing and rebalance perspectives.']
        ];

        const configs = [];
        let idx = 0;
        while (configs.length < bot_count) {
            const persona = bot_personas[idx % bot_personas.length];
            const suffix = idx < bot_personas.length ? '' : ` #${idx + 1}`;
            configs.push([`${persona[0]}${suffix}`, persona[1]]);
            idx++;
        }
        return configs;
    }

    _calculate_emissions() {
        return MultiLLM.KWH_PER_SEARCH * MultiLLM.G_CO2_PER_KWH;
    }
}

module.exports = { MultiLLM, GenerationConfig, SustainabilityMetrics };