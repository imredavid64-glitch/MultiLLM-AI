# Unified Sustainable AI Ecosystem

This repository combines the Multi LLM Desktop Suite with EcoBrain: Sustainable Local AI Engine into a comprehensive multi-language AI platform.

## Overview

The unified ecosystem brings together:

1. **Multi LLM Provider Stack** - Zero-key API key management, parallel bot execution
2. **EcoBrain Learning Engine** - Local context retention, zero-GPU, sustainable AI reasoning  
3. **Sustainable Analytics** - Real-time carbon footprint monitoring and optimization
4. **Multi-Platform Runtime** - Python, C++, JavaScript, Java implementations

## Core Architecture

### 1. Multi LLM Provider Stack (sustainable-ai)

**Location**: `/Users/imredavid/Downloads/MultiLLM/ai_client.py`

**Features**:
- Zero-key Environment Loading: `.env` file for API configuration (never committed)
- Parallel Bot Execution: N-way parallel inference with bot persona selection
- Ensemble Synthesis: Multi-candidate comparison and final answer generation
- Sustainability Metrics: Source quality, bias scoring, and carbon impact calculation
- Privacy Redaction: Built-in sensitive pattern detection and redaction

### 2. EcoBrain Learning Engine (sustainable-ai-brain)

**Location**: `/Users/imredavid/Downloads/sustainable-ai-app/`

**Core Classes**:
- CustomLocalBrain: Local knowledge retention, vocabulary weight management
- SearchAgent: Open-source DuckDuckGo integration with context extraction
- SustainableAnalyst: Emissions tracking, sustainability metrics calculation

**Key Features**:
- Zero External Dependencies: Runs entirely offline after initial context
- Carbon-Neutral: No cloud API calls, sustainable compute
- Continuous Learning: Local brain weights update based on user preferences
- Contextual Understanding: Advanced text processing without external APIs

### 3. Carbon Footprint Calculator (sustainable-ai-core)

**Purpose**: Real-time sustainability monitoring during AI operations

**Metrics Tracked**:
- Carbon Emissions: g CO₂ per query calculation
- Water Footprint: Liters of water used per query
- Carbon Savings: Avoided emissions vs. cloud API alternatives
- Latency: Real-time performance monitoring

## Integration Architecture

### Unified Interface
```python
from sustainable_ai import UnifiedAI

class SustainableAI:
    def __init__(self):
        self.multi_llm = MultiLLM()
        self.eco_brain = CustomLocalBrain()
        self.analyst = SustainableAnalyst()
    
    def query(self, question, config=None):
        # Parallel execution of both engines
        # Collect sustainability metrics
        # Return unified response
        pass
```

## Key Benefits

✅ **Zero Environmental Impact**: Carbon-neutral AI operations  
✅ **Zero Privacy Risk**: No data leaves local machines  
✅ **Zero Cost**: No API key expenses  
✅ **Zero Infrastructure**: Works on any device  
✅ **Multi-Language Support**: Python, JavaScript, Java, C++  
✅ **Edge Computing Ready**: Optimized for local execution  

## Getting Started (Python)

```bash
cd /Users/imredavid/Downloads/MultiLLM
pip install -r requirements.txt
streamlit run ai_client_test_ui.py
```

## Runtime Setup

### Python (Primary)
- `MultiLLM/ai_client.py` - Core Multi LLM logic
- `sustainable-ai-app/` - Sustainable AI modules

### JavaScript Runtime (Browser/Node.js)
- `js/` - Web-optimized versions

### Java Runtime (Android, Enterprise)
- `java/` - Java implementation

### C++ Runtime (Performance Critical)
- `cpp/` - High-performance implementation

## Future Roadmap

### Phase 1: Core Foundation (Complete)
- Unified library architecture
- Multi-platform implementations
- Basic sustainability metrics

### Phase 2: Advanced Features (In Progress)
- [ ] Model compression and quantization
- [ ] Edge device optimization
- [ ] Advanced sustainability reporting

### Phase 3: Ecosystem Growth (Future)
- [ ] Community plugin system
- [ ] Multi-language model support
- [ ] Enterprise deployment options

## Contributing

This is an open ecosystem designed for contributions:

1. **Add New Providers**: Implement new ChatProvider subclasses
2. **Platform Support**: Add new runtime implementations
3. **Optimization**: Improve algorithm efficiency
4. **Documentation**: Add examples and tutorials

## License

This project is licensed under the MIT License.