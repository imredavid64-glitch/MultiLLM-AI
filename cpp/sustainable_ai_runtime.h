#ifndef SUSTAINABLE_AI_RUNTIME_H
#define SUSTAINABLE_AI_RUNTIME_H

#include <string>
#include <vector>
#include <map>
#include <chrono>
#include <memory>
#include <optional>
#include <mutex>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace sustainable_ai {

struct GenerationConfig {
    float temperature = 0.2f;
    std::optional<float> top_p = std::nullopt;
    std::optional<int> top_k = std::nullopt;
    std::optional<int> max_tokens = std::nullopt;
    std::optional<float> repetition_penalty = std::nullopt;
};

struct SustainabilityMetrics {
    std::string timestamp;
    std::string query;
    float accuracy = 0.0f;
    float bias = 0.0f;
    float emissions_g = 0.0f;
    float water_l = 0.0f;
    float carbon_saved_g = 0.0f;
    float latency_s = 0.0f;
    std::string user_preference = "";
};

class ChatProvider {
public:
    virtual ~ChatProvider() = default;
    virtual std::string get_name() const = 0;
    virtual std::string get_model() const = 0;
    virtual int get_size() const = 0;
    virtual std::string chat(const std::vector<std::map<std::string, std::string>>& messages, 
                            const GenerationConfig& config) = 0;
};

class MultiLLM {
public:
    MultiLLM();
    ~MultiLLM();

    bool load_providers();
    std::pair<std::string, SustainabilityMetrics> query(
        const std::string& question,
        const GenerationConfig& config = GenerationConfig()
    );

    static std::string get_provider_status();

private:
    std::vector<std::unique_ptr<ChatProvider>> providers_;
    std::mutex providers_mutex_;
    static constexpr float KWH_PER_SEARCH = 0.0003f;
    static constexpr float G_CO2_PER_KWH = 442.0f;
    static constexpr float LITERS_PER_KWH = 1.8f;
    static constexpr float CLOUD_LLM_KWH = 0.002f;
};

} // namespace sustainable_ai

#endif // SUSTAINABLE_AI_RUNTIME_H