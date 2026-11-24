package com.peachsoft.peachagent.model;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import tools.jackson.databind.json.JsonMapper;

/**
 * 每种接口协议独立注册，供应商模型由用户配置。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:32
 */
@Configuration
public class BuiltinProtocols {
    @Bean
    ModelProtocolAdapter openAiChat(JsonMapper mapper) {
        return new OpenAiCompatibleAdapter(mapper, "openai.chat-completions", "LLM", "CHAT", "chat/completions");
    }

    @Bean
    ModelProtocolAdapter openAiEmbedding(JsonMapper mapper) {
        return new OpenAiCompatibleAdapter(mapper, "openai.embeddings", "EMBEDDING", "EMBED", "embeddings");
    }

    @Bean
    ModelProtocolAdapter openAiImage(JsonMapper mapper) {
        return new OpenAiCompatibleAdapter(mapper, "openai.images", "IMAGE", "GENERATE_IMAGE", "images/generations");
    }

    @Bean
    ModelProtocolAdapter openAiTranscribe(JsonMapper mapper) {
        return new OpenAiCompatibleAdapter(
                mapper, "openai.audio-transcriptions", "STT", "TRANSCRIBE", "audio/transcriptions");
    }

    @Bean
    ModelProtocolAdapter openAiSpeech(JsonMapper mapper) {
        return new OpenAiCompatibleAdapter(mapper, "openai.audio-speech", "TTS", "SYNTHESIZE", "audio/speech");
    }
}
