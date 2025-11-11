/**
 * ============================================
 * AI PROVIDER TYPES
 * ============================================
 * Central types for all AI provider implementations
 * Ensures all providers follow same interface
 */

/**
 * Supported AI providers in the system
 */
export enum AIProviderType {
  CLAUDE = 'claude',
  OPENAI = 'openai',
  GEMINI = 'gemini',
  COPILOT = 'copilot',
  VSCODE_LM = 'vscode-lm',
}

/**
 * Represents a message in conversation
 * Used for maintaining context across requests
 */
export interface ConversationMessage {
  /** 'user' or 'assistant' - who sent this message */
  role: 'user' | 'assistant';
  
  /** The actual message content */
  content: string;
  
  /** When this message was sent */
  timestamp: Date;
}

/**
 * Request sent to an AI provider
 * Standard format for all providers
 */
export interface AIProviderRequest {
  /** The question/prompt to send */
  question: string;
  
  /** Full code context around the error */
  codeContext: string;
  
  /** Error message from the compiler/runtime */
  errorMessage: string;
  
  /** File path where error occurred */
  filePath: string;
  
  /** Error type (syntax, type, reference, etc.) */
  errorType: string;
  
  /** Conversation history for context */
  conversationHistory?: ConversationMessage[];
  
  /** Maximum tokens in response */
  maxTokens?: number;
  
  /** Temperature for response creativity (0-1, where 0 = deterministic) */
  temperature?: number;
}

/**
 * Response from an AI provider
 * Standard format for all providers
 */
export interface AIProviderResponse {
  /** Unique ID for this response */
  id: string;
  
  /** The actual response text */
  text: string;
  
  /** Provider that generated this */
  provider: AIProviderType;
  
  /** Time taken to generate response (ms) */
  responseTime: number;
  
  /** When response was generated */
  timestamp: Date;
  
  /** Token usage info */
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  
  /** Was this response successful? */
  success: boolean;
  
  /** Error message if response failed */
  error?: string;
  
  /** Stop reason (completed, max_tokens, etc.) */
  stopReason?: string;
}

/**
 * Configuration for an AI provider
 */
export interface AIProviderConfig {
  /** Provider type */
  type: AIProviderType;
  
  /** API key (if required) */
  apiKey?: string;
  
  /** Custom API endpoint (if supported) */
  endpoint?: string;
  
  /** Provider-specific settings */
  settings?: Record<string, any>;
}

/**
 * Capabilities of an AI provider
 */
export interface AIProviderCapabilities {
  /** Can this provider be used right now? */
  isAvailable: boolean;
  
  /** Does it require an API key? */
  requiresApiKey: boolean;
  
  /** Maximum context window size (tokens) */
  maxContextWindow: number;
  
  /** Default max output tokens */
  defaultMaxTokens: number;
  
  /** Does provider support streaming? */
  supportsStreaming: boolean;
  
  /** Cost per million input tokens (if paid) */
  costPerMillion?: {
    input: number;
    output: number;
  };
  
  /** Description of provider */
  description: string;
  
  /** Error message if not available */
  availabilityNote?: string;
}

/**
 * Interface that all AI providers must implement
 */
export interface IAIProvider {
  /** Get provider type */
  getType(): AIProviderType;
  
  /** Check if provider is ready to use */
  isAvailable(): Promise<boolean>;
  
  /** Get provider capabilities */
  getCapabilities(): AIProviderCapabilities;
  
  /** Send request to AI provider */
  sendRequest(request: AIProviderRequest): Promise<AIProviderResponse>;
  
  /** Send request with streaming response */
  sendRequestStream(
    request: AIProviderRequest,
    onChunk: (chunk: string) => void,
  ): Promise<AIProviderResponse>;
  
  /** Validate provider is properly configured */
  validate(): Promise<{ valid: boolean; error?: string }>;
  
  /** Set API key or credentials */
  setCredentials(config: AIProviderConfig): Promise<void>;
  
  /** Clear credentials */
  clearCredentials(): Promise<void>;
}

/**
 * Provider manager configuration
 */
export interface ProviderManagerConfig {
  /** Default provider to use */
  defaultProvider: AIProviderType;
  
  /** Enable fallback to other providers if one fails */
  enableFallback: boolean;
  
  /** List of providers to initialize */
  enabledProviders: AIProviderType[];
  
  /** Timeout for API requests (ms) */
  requestTimeout: number;
  
  /** Retry failed requests? */
  enableRetry: boolean;
  
  /** Number of retries */
  maxRetries: number;
}

/**
 * Error from AI provider
 */
export class AIProviderError extends Error {
  constructor(
    public provider: AIProviderType,
    message: string,
    public code?: string,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'AIProviderError';
  }
}

/**
 * Prompt template for generating questions
 * Used by all providers for consistency
 */
export interface PromptTemplate {
  /** Template system message */
  system: string;
  
  /** Template user prompt */
  user: string;
  
  /** Optional: template for follow-up questions */
  followUp?: string;
}

/**
 * Default prompt template
 */
export const DEFAULT_PROMPT_TEMPLATE: PromptTemplate = {
  system: `You are an expert debugging assistant. Help developers understand and fix their code errors.
When responding:
1. Explain the error in simple terms
2. Provide the root cause
3. Suggest 2-3 fixes with code examples
4. Explain best practices to prevent this error
Keep responses concise but thorough.`,

  user: `I have a {errorType} error in my code.

File: {filePath}

Error Message: {errorMessage}

Code Context:
\`\`\`
{codeContext}
\`\`\`

Question: {question}`,

  followUp: `Based on our previous discussion about this error, {followUpQuestion}`,
};

/**
 * Store for credentials (will be replaced by secure storage)
 */
export interface CredentialStore {
  /** Get stored credential */
  get(provider: AIProviderType): Promise<string | null>;
  
  /** Store credential */
  set(provider: AIProviderType, credential: string): Promise<void>;
  
  /** Delete credential */
  delete(provider: AIProviderType): Promise<void>;
  
  /** Clear all credentials */
  clear(): Promise<void>;
}

/**
 * Default configuration for provider manager
 */
export const DEFAULT_PROVIDER_CONFIG: ProviderManagerConfig = {
  defaultProvider: AIProviderType.GEMINI,
  enableFallback: true,
  enabledProviders: [
    AIProviderType.GEMINI,
    AIProviderType.CLAUDE,
    AIProviderType.OPENAI,
    AIProviderType.COPILOT,
  ],
  requestTimeout: 30000, // 30 seconds
  enableRetry: true,
  maxRetries: 3,
};
