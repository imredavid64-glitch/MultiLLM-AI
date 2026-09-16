export interface SustainabilityMetrics {
  carbon_saved_g: number;
  latency_s: number;
  accuracy: number;
  emissions_g: number;
}

export interface MultiLLMResult {
  answer: string;
  metrics: SustainabilityMetrics;
}

export interface MultiLLMOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  repetition_penalty?: number;
}
