import { describe, it, expect, beforeEach } from "vitest";
import { AgentFactory } from "../../src/services/agent_factory.ts";
import { PiAgentProcessor } from "../../src/services/pi_agent_processor.ts";
import { ClaudeProcessor } from "../../src/services/claude_processor.ts";
import { resolveConfig, type AppConfig } from "../../src/config.ts";

describe("Provider API Compatibility Integration Tests", () => {
  const createConfigForProvider = (provider: string, apiType: string, baseUrl?: string): AppConfig => {
    const baseConfig = resolveConfig();
    return {
      ...baseConfig,
      models: {
        providers: {
          [provider]: {
            api: apiType as "anthropic" | "openai",
            apiKey: "test-key",
            baseUrl: baseUrl || undefined,
            models: [
              {
                id: "test-model",
                name: "Test Model"
              }
            ]
          }
        }
      },
      agents: {
        model: `${provider}/test-model`
      }
    };
  };

  describe("Anthropic API Provider Compatibility", () => {
    it("should use ClaudeProcessor for official Anthropic provider", () => {
      const config = createConfigForProvider("anthropic", "anthropic");
      const agent = AgentFactory.create(config, config.skillDirs);

      expect(agent).toBeInstanceOf(ClaudeProcessor);
    });

    it("should use ClaudeProcessor for Anthropic-compatible endpoint with custom baseUrl", () => {
      const config = createConfigForProvider(
        "anthropic-custom",
        "anthropic",
        "https://custom-anthropic-endpoint.example.com"
      );
      const agent = AgentFactory.create(config, config.skillDirs);

      expect(agent).toBeInstanceOf(ClaudeProcessor);
    });

    it("should support multiple Anthropic-compatible providers", () => {
      const baseConfig = resolveConfig();
      const config = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "key1",
              models: [{ id: "model1", name: "Model 1" }]
            },
            "copilot-api": {
              api: "anthropic",
              apiKey: "key2",
              baseUrl: "https://copilot.example.com",
              models: [{ id: "model2", name: "Model 2" }]
            },
            "custom-anthropic": {
              api: "anthropic",
              apiKey: "key3",
              models: [{ id: "model3", name: "Model 3" }]
            }
          }
        },
        agents: {
          model: "anthropic/model1"
        }
      };

      const agent1 = AgentFactory.create(config as AppConfig, config.skillDirs);
      expect(agent1).toBeInstanceOf(ClaudeProcessor);

      // Switch to different Anthropic-compatible provider
      const configWithDifferentProvider = {
        ...config,
        agents: {
          model: "custom-anthropic/model3"
        }
      };
      const agent2 = AgentFactory.create(configWithDifferentProvider as AppConfig, configWithDifferentProvider.skillDirs);
      expect(agent2).toBeInstanceOf(ClaudeProcessor);
    });

    it("should pass Anthropic API configuration to ClaudeProcessor", () => {
      const baseConfig = resolveConfig();
      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            "anthropic-custom": {
              api: "anthropic",
              apiKey: "custom-key",
              baseUrl: "https://api.example.com",
              models: [
                {
                  id: "model",
                  name: "Custom Model"
                }
              ]
            }
          }
        },
        agents: {
          model: "anthropic-custom/model"
        }
      };

      const agent = AgentFactory.create(config, config.skillDirs);
      expect(agent).toBeInstanceOf(ClaudeProcessor);
    });
  });

  describe("OpenAI API Provider Compatibility", () => {
    it("should use PiAgentProcessor for official OpenAI provider", () => {
      const config = createConfigForProvider("openai", "openai", "https://api.openai.com/v1");
      const agent = AgentFactory.create(config, config.skillDirs);

      expect(agent).toBeInstanceOf(PiAgentProcessor);
    });

    it("should use PiAgentProcessor for OpenAI-compatible endpoint", () => {
      const config = createConfigForProvider(
        "openai-compatible",
        "openai",
        "https://custom-openai-endpoint.example.com"
      );
      const agent = AgentFactory.create(config, config.skillDirs);

      expect(agent).toBeInstanceOf(PiAgentProcessor);
    });

    it("should support multiple OpenAI-compatible providers", () => {
      const baseConfig = resolveConfig();
      const config = {
        ...baseConfig,
        models: {
          providers: {
            openai: {
              api: "openai",
              apiKey: "key1",
              baseUrl: "https://api.openai.com/v1",
              models: [{ id: "gpt-4", name: "GPT-4" }]
            },
            alibaba: {
              api: "openai",
              apiKey: "key2",
              baseUrl: "https://dashscope.aliyuncs.com",
              models: [{ id: "qwen-max", name: "Qwen Max" }]
            },
            moonshot: {
              api: "openai",
              apiKey: "key3",
              baseUrl: "https://api.moonshot.cn",
              models: [{ id: "moonshot-v1", name: "Moonshot V1" }]
            }
          }
        },
        agents: {
          model: "openai/gpt-4"
        }
      };

      const agent1 = AgentFactory.create(config as AppConfig, config.skillDirs);
      expect(agent1).toBeInstanceOf(PiAgentProcessor);

      // Switch to different OpenAI-compatible provider
      const configWithDifferentProvider = {
        ...config,
        agents: {
          model: "alibaba/qwen-max"
        }
      };
      const agent2 = AgentFactory.create(configWithDifferentProvider as AppConfig, configWithDifferentProvider.skillDirs);
      expect(agent2).toBeInstanceOf(PiAgentProcessor);
    });

    it("should pass OpenAI API configuration to PiAgentProcessor", () => {
      const baseConfig = resolveConfig();
      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            "openai-compatible": {
              api: "openai",
              apiKey: "custom-key",
              baseUrl: "https://custom-openai.example.com",
              models: [
                {
                  id: "custom-model",
                  name: "Custom OpenAI Compatible Model"
                }
              ]
            }
          }
        },
        agents: {
          model: "openai-compatible/custom-model"
        }
      };

      const agent = AgentFactory.create(config, config.skillDirs);
      expect(agent).toBeInstanceOf(PiAgentProcessor);
    });
  });

  describe("Mixed Provider Type Configuration", () => {
    it("should route to correct processor based on api type", () => {
      const baseConfig = resolveConfig();
      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "key1",
              models: [{ id: "opus", name: "Claude Opus" }]
            },
            openai: {
              api: "openai",
              apiKey: "key2",
              baseUrl: "https://api.openai.com/v1",
              models: [{ id: "gpt-4", name: "GPT-4" }]
            },
            alibaba: {
              api: "openai",
              apiKey: "key3",
              baseUrl: "https://alibaba.example.com",
              models: [{ id: "qwen", name: "Qwen" }]
            }
          }
        },
        agents: {
          model: "anthropic/opus"
        }
      };

      const agent1 = AgentFactory.create(config, config.skillDirs);
      expect(agent1).toBeInstanceOf(ClaudeProcessor);

      // Test OpenAI routing
      const configOpenAI: AppConfig = {
        ...config,
        agents: {
          model: "openai/gpt-4"
        }
      };
      const agent2 = AgentFactory.create(configOpenAI, configOpenAI.skillDirs);
      expect(agent2).toBeInstanceOf(PiAgentProcessor);

      // Test custom OpenAI-compatible routing
      const configAlibaba: AppConfig = {
        ...config,
        agents: {
          model: "alibaba/qwen"
        }
      };
      const agent3 = AgentFactory.create(configAlibaba, configAlibaba.skillDirs);
      expect(agent3).toBeInstanceOf(PiAgentProcessor);
    });

    it("should use first provider when default model not specified", () => {
      const baseConfig = resolveConfig();
      const config: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "key1",
              models: [{ id: "opus", name: "Claude Opus" }]
            },
            openai: {
              api: "openai",
              apiKey: "key2",
              baseUrl: "https://api.openai.com/v1",
              models: [{ id: "gpt-4", name: "GPT-4" }]
            }
          }
        },
        agents: {} // No default model specified
      };

      const agent = AgentFactory.create(config, config.skillDirs);
      // Should use first provider (anthropic)
      expect(agent).toBeInstanceOf(ClaudeProcessor);
    });

    it("should support switching between providers at runtime via configuration", () => {
      const baseConfig = resolveConfig();
      const multiProviderConfig: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "key1",
              models: [{ id: "opus", name: "Claude Opus" }]
            },
            openai: {
              api: "openai",
              apiKey: "key2",
              baseUrl: "https://api.openai.com/v1",
              models: [{ id: "gpt-4", name: "GPT-4" }]
            }
          }
        },
        agents: {
          model: "anthropic/opus"
        }
      };

      // First use Anthropic
      const agent1 = AgentFactory.create(multiProviderConfig, multiProviderConfig.skillDirs);
      expect(agent1).toBeInstanceOf(ClaudeProcessor);

      // Then switch to OpenAI by changing default model
      const switchedConfig: AppConfig = {
        ...multiProviderConfig,
        agents: {
          model: "openai/gpt-4"
        }
      };
      const agent2 = AgentFactory.create(switchedConfig, switchedConfig.skillDirs);
      expect(agent2).toBeInstanceOf(PiAgentProcessor);
    });
  });

  describe("Provider Configuration Validation", () => {
    it("should validate provider has required fields", () => {
      const baseConfig = resolveConfig();
      const invalidConfig: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            invalid: {
              api: "anthropic",
              // Missing apiKey - this should work (optional)
              models: [{ id: "model", name: "Model" }]
            }
          }
        },
        agents: {
          model: "invalid/model"
        }
      };

      // Should not throw - apiKey is optional at validation level
      expect(() => AgentFactory.create(invalidConfig, invalidConfig.skillDirs)).not.toThrow();
    });

    it("should support providers with and without baseUrl", () => {
      const baseConfig = resolveConfig();
      const configNoBaseUrl: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            anthropic: {
              api: "anthropic",
              apiKey: "key1",
              models: [{ id: "opus", name: "Claude" }]
            }
          }
        },
        agents: {
          model: "anthropic/opus"
        }
      };

      const configWithBaseUrl: AppConfig = {
        ...baseConfig,
        models: {
          providers: {
            "anthropic-custom": {
              api: "anthropic",
              apiKey: "key2",
              baseUrl: "https://custom.example.com",
              models: [{ id: "opus", name: "Claude" }]
            }
          }
        },
        agents: {
          model: "anthropic-custom/opus"
        }
      };

      const agent1 = AgentFactory.create(configNoBaseUrl, configNoBaseUrl.skillDirs);
      expect(agent1).toBeInstanceOf(ClaudeProcessor);

      const agent2 = AgentFactory.create(configWithBaseUrl, configWithBaseUrl.skillDirs);
      expect(agent2).toBeInstanceOf(ClaudeProcessor);
    });
  });
});
