
import * as vscode from 'vscode';
import {
  IAIProvider,
  AIProviderType,
  AIProviderRequest,
  AIProviderResponse,
  AIProviderConfig,
  AIProviderCapabilities,
  ConversationMessage,
  AIProviderError,
  DEFAULT_PROMPT_TEMPLATE,
} from './types';
import { getCredentialManager } from './credentialManager';

/**
 * ============================================
 * OPENAI PROVIDER
 * ============================================
 * 
 * OpenAI ChatGPT AI Provider Implementation
 * Docs: https://platform.openai.com/docs/api-reference
 * 
 * Features:
 * - Latest models: GPT-4o, GPT-4 Turbo
 * - Excellent general reasoning
 * - Vision capabilities
 * - Function calling support
 * - Streaming support
 * 
 * Models:
 * - gpt-4o (Recommended) - Newest, best value
 * - gpt-4-turbo - Previous best
 * - gpt-4 - Older, slower
 * - gpt-3.5-turbo - Fast, cheap
 * 
 * Capabilities:
 * - Context window: 128k tokens (GPT-4o)
 * - Max output: 4k tokens
 * - Temperature: 0-2 (default 1)
 * - Pricing: $5/$15 per million tokens (GPT-4o)
 */
export class OpenAIProvider implements IAIProvider {
  /**
   * Provider type identifier
   */
  private readonly type = AIProviderType.OPENAI;

  /**
   * OpenAI API endpoint
   */
  private readonly API_ENDPOINT = 'https://api.openai.com/v1';

  /**
   * Model to use
   * Options: gpt-4o, gpt-4-turbo, gpt-4, gpt-3.5-turbo
   */
  private readonly MODEL = 'gpt-4o';

  /**
   * API key (loaded from credential store)
   */
  private apiKey: string | null = null;

  /**
   * Conversation history for multi-turn support
   */
  private conversationHistory: Map<string, ConversationMessage[]> = new Map();

  /**
   * Provider capabilities
   */
  private readonly capabilities: AIProviderCapabilities = {
    isAvailable: false,
    requiresApiKey: true,
    maxContextWindow: 128000, // tokens
    defaultMaxTokens: 2000,
    supportsStreaming: true,
    costPerMillion: {
      input: 5, // $5 per million input tokens
      output: 15, // $15 per million output tokens
    },
    description: 'OpenAI GPT-4o - Latest model, excellent for code and reasoning',
  };

  /**
   * Constructor
   */
  constructor() {
    console.log('[OpenAIProvider] Initialized');
  }

  /**
   * ============================================
   * INTERFACE IMPLEMENTATION
   * ============================================
   */

  /**
   * Get provider type
   */
  getType(): AIProviderType {
    return this.type;
  }

  /**
   * Check if provider is available
   * Loads API key from credential store
   * 
   * @returns true if API key configured
   */
  async isAvailable(): Promise<boolean> {
    try {
      const credentialManager = getCredentialManager();
      this.apiKey = await credentialManager.getCredential(this.type);

      if (!this.apiKey) {
        console.log('[OpenAIProvider] No API key configured');
        return false;
      }

      console.log('[OpenAIProvider] ✅ API key found');
      return true;
    } catch (error) {
      console.error('[OpenAIProvider] Error checking availability:', error);
      return false;
    }
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(): AIProviderCapabilities {
    return {
      ...this.capabilities,
      isAvailable: this.apiKey !== null,
    };
  }

  /**
   * ============================================
   * MAIN REQUEST HANDLING
   * ============================================
   */

  /**
   * Send request to OpenAI API
   * 
   * @param request - The debugging question request
   * @returns Response from ChatGPT
   * 
   * @example
   * const response = await openaiProvider.sendRequest({
   *   question: "Why is this error happening?",
   *   codeContext: "const x: number = 'string';",
   *   errorMessage: "Type 'string' is not assignable to type 'number'",
   *   filePath: "app.ts",
   *   errorType: "type"
   * });
   * 
   * Flow:
   * 1. Validate API key
   * 2. Build prompt
   * 3. Get conversation history
   * 4. Make API request
   * 5. Parse response
   * 6. Store in history
   * 7. Return response
   */
  async sendRequest(request: AIProviderRequest): Promise<AIProviderResponse> {
    const startTime = Date.now();

    try {
      console.log('[OpenAIProvider] Sending request...');

      // Validate
      if (!this.apiKey) {
        throw new AIProviderError(
          this.type,
          'OpenAI API key not configured. Please add your API key in settings.'
        );
      }

      // Build prompt
      const prompt = this.buildPrompt(request);
      console.log('[OpenAIProvider] Prompt built, length:', prompt.length);

      // Get conversation history
      const history = this.getConversationHistory(request.filePath);

      // Build messages array
      const messages = this.buildMessages(prompt, history);

      // Make API request
      const response = await this.callOpenAIAPI(
        messages,
        request.maxTokens || this.capabilities.defaultMaxTokens
      );

      // Parse response
      const responseText = this.parseResponse(response);

      // Store in history
      this.storeInHistory(request, responseText);

      // Calculate token usage
      const tokenUsage = {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      };

      const responseTime = Date.now() - startTime;

      console.log(`[OpenAIProvider] ✅ Request successful (${responseTime}ms)`);

      return {
        id: this.generateId(),
        text: responseText,
        provider: this.type,
        responseTime,
        timestamp: new Date(),
        tokenUsage,
        success: true,
        stopReason: response.choices[0].finish_reason,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error('[OpenAIProvider] ❌ Request failed:', errorMessage);

      // Handle specific errors
      let friendlyMessage = errorMessage;
      if (errorMessage.includes('401')) {
        friendlyMessage = 'Invalid API key. Please check your OpenAI API key.';
      } else if (errorMessage.includes('429')) {
        friendlyMessage = 'Rate limit exceeded. Please try again in a moment.';
      } else if (errorMessage.includes('503')) {
        friendlyMessage = 'OpenAI API is temporarily unavailable.';
      } else if (errorMessage.includes('insufficient_quota')) {
        friendlyMessage = 'Insufficient quota. Please check your OpenAI billing.';
      }

      return {
        id: this.generateId(),
        text: '',
        provider: this.type,
        responseTime,
        timestamp: new Date(),
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        success: false,
        error: friendlyMessage,
      };
    }
  }

  /**
   * Send request with streaming response
   * 
   * @param request - The request
   * @param onChunk - Callback for each chunk
   * @returns Complete response
   * 
   * @example
   * await openaiProvider.sendRequestStream(request, (chunk) => {
   *   console.log(chunk); // Print as it arrives
   *   updateUI(chunk);
   * });
   */
  async sendRequestStream(
    request: AIProviderRequest,
    onChunk: (chunk: string) => void
  ): Promise<AIProviderResponse> {
    const startTime = Date.now();

    try {
      console.log('[OpenAIProvider] Sending streaming request...');

      if (!this.apiKey) {
        throw new AIProviderError(this.type, 'OpenAI API key not configured');
      }

      const prompt = this.buildPrompt(request);
      const history = this.getConversationHistory(request.filePath);
      const messages = this.buildMessages(prompt, history);

      // Make streaming API call
      const response = await this.callOpenAIStreamingAPI(
        messages,
        request.maxTokens || this.capabilities.defaultMaxTokens,
        onChunk
      );

      // Store in history
      this.storeInHistory(request, response.fullText);

      const responseTime = Date.now() - startTime;

      console.log(`[OpenAIProvider] ✅ Streaming complete (${responseTime}ms)`);

      return {
        id: this.generateId(),
        text: response.fullText,
        provider: this.type,
        responseTime,
        timestamp: new Date(),
        tokenUsage: response.tokenUsage,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[OpenAIProvider] Streaming failed:', errorMessage);

      return {
        id: this.generateId(),
        text: '',
        provider: this.type,
        responseTime: Date.now() - startTime,
        timestamp: new Date(),
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * ============================================
   * CREDENTIAL MANAGEMENT
   * ============================================
   */

  /**
   * Validate provider is properly configured
   * Tests connection to API
   * 
   * @returns { valid: boolean, error?: string }
   */
  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      console.log('[OpenAIProvider] Validating configuration...');

      // Check if API key available
      const credentialManager = getCredentialManager();
      const apiKey = await credentialManager.getCredential(this.type);

      if (!apiKey) {
        return {
          valid: false,
          error: 'No API key configured. Add your OpenAI API key in settings.',
        };
      }

      this.apiKey = apiKey;

      // Test API connection with a simple request
      try {
        const response = await this.callOpenAIAPI(
          [
            {
              role: 'user',
              content: 'Say "OK" if you can understand this.',
            },
          ],
          50
        );

        if (
          response.choices[0].message.content &&
          response.choices[0].message.content.length > 0
        ) {
          console.log('[OpenAIProvider] ✅ Validation successful');
          return { valid: true };
        }
      } catch (apiError) {
        const msg = apiError instanceof Error ? apiError.message : String(apiError);
        return {
          valid: false,
          error: `API connection failed: ${msg}`,
        };
      }

      return { valid: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Set API key credentials
   * 
   * @param config - Configuration with API key
   */
  async setCredentials(config: AIProviderConfig): Promise<void> {
    try {
      if (!config.apiKey) {
        throw new Error('API key is required');
      }

      // Validate format
      const credentialManager = getCredentialManager();
      const validation = credentialManager.validateApiKeyFormat(this.type, config.apiKey);

      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Store securely
      await credentialManager.setCredential(this.type, config.apiKey);
      this.apiKey = config.apiKey;

      console.log('[OpenAIProvider] ✅ Credentials updated');
    } catch (error) {
      console.error('[OpenAIProvider] Failed to set credentials:', error);
      throw error;
    }
  }

  /**
   * Clear stored credentials
   */
  async clearCredentials(): Promise<void> {
    try {
      const credentialManager = getCredentialManager();
      await credentialManager.deleteCredential(this.type);
      this.apiKey = null;

      console.log('[OpenAIProvider] ✅ Credentials cleared');
    } catch (error) {
      console.error('[OpenAIProvider] Failed to clear credentials:', error);
      throw error;
    }
  }

  /**
   * ============================================
   * INTERNAL API METHODS
   * ============================================
   */

  /**
   * Build prompt from template
   * 
   * @param request - Request with error details
   * @returns Complete prompt string
   */
  private buildPrompt(request: AIProviderRequest): string {
    let prompt = DEFAULT_PROMPT_TEMPLATE.user;

    prompt = prompt.replace('{errorType}', request.errorType);
    prompt = prompt.replace('{filePath}', request.filePath);
    prompt = prompt.replace('{errorMessage}', request.errorMessage);
    prompt = prompt.replace('{codeContext}', request.codeContext);
    prompt = prompt.replace('{question}', request.question);

    return prompt;
  }

  /**
   * Build messages array for OpenAI API
   * OpenAI format:
   * [
   *   { role: "system", content: "system prompt" },
   *   { role: "user", content: "message" },
   *   { role: "assistant", content: "response" }
   * ]
   * 
   * @param currentPrompt - Current user prompt
   * @param history - Conversation history
   * @returns Messages array
   */
  private buildMessages(
    currentPrompt: string,
    history: ConversationMessage[]
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    // Add system prompt
    messages.push({
      role: 'system',
      content: DEFAULT_PROMPT_TEMPLATE.system,
    });

    // Add conversation history
    for (const msg of history) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // Add current prompt
    messages.push({
      role: 'user',
      content: currentPrompt,
    });

    return messages;
  }

  /**
   * Call OpenAI API (non-streaming)
   * Makes HTTP request to OpenAI
   * 
   * @param messages - Messages array
   * @param maxTokens - Maximum tokens in response
   * @returns API response
   * 
   * HTTP Request:
   * POST https://api.openai.com/v1/chat/completions
   * Headers: Authorization: Bearer sk-...
   * 
   * Body:
   * {
   *   "model": "gpt-4o",
   *   "messages": [...],
   *   "max_tokens": 2000,
   *   "temperature": 0.7
   * }
   */
  private async callOpenAIAPI(
    messages: Array<{ role: string; content: string }>,
    maxTokens: number
  ): Promise<any> {
    const url = `${this.API_ENDPOINT}/chat/completions`;

    const payload = {
      model: this.MODEL,
      messages: messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    };

    try {
      console.log('[OpenAIProvider] Making API request...');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      // Check response status
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        throw new Error(`API Error ${response.status}: ${errorMessage}`);
      }

      const data = await response.json();
      console.log('[OpenAIProvider] API response received');

      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[OpenAIProvider] API call failed:', errorMessage);
      throw new AIProviderError(
        this.type,
        `Failed to call OpenAI API: ${errorMessage}`
      );
    }
  }

  /**
   * Call OpenAI API with streaming
   * Uses Server-Sent Events format
   * 
   * @param messages - Messages array
   * @param maxTokens - Maximum tokens
   * @param onChunk - Callback for each chunk
   * @returns Object with full text and token usage
   * 
   * Streaming response format:
   * data: {"choices":[{"delta":{"content":"text chunk"}}]}
   * data: [DONE]
   */
  private async callOpenAIStreamingAPI(
    messages: Array<{ role: string; content: string }>,
    maxTokens: number,
    onChunk: (chunk: string) => void
  ): Promise<{
    fullText: string;
    tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  }> {
    const url = `${this.API_ENDPOINT}/chat/completions`;

    const payload = {
      model: this.MODEL,
      messages: messages,
      max_tokens: maxTokens,
      temperature: 0.7,
      stream: true, // Enable streaming
    };

    let fullText = '';

    try {
      console.log('[OpenAIProvider] Making streaming API request...');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.statusText}`);
      }

      // Parse streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        // Process complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();

          // SSE format: "data: {json}"
          if (line === 'data: [DONE]') {
            continue; // Stream finished
          }

          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6);
              const chunk = JSON.parse(jsonStr);

              // Extract text delta
              if (
                chunk.choices?.[0]?.delta?.content
              ) {
                const text = chunk.choices[0].delta.content;
                fullText += text;
                onChunk(text); // Call callback for UI update
              }
            } catch (e) {
              console.log('[OpenAIProvider] Could not parse chunk:', line);
            }
          }
        }

        // Keep incomplete line for next iteration
        buffer = lines[lines.length - 1];
      }

      // Estimate token usage (OpenAI doesn't provide in streaming)
      const inputTokens = Math.ceil(messages.reduce((sum, m) => sum + m.content.length, 0) / 4);
      const outputTokens = Math.ceil(fullText.length / 4);

      return {
        fullText,
        tokenUsage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new AIProviderError(
        this.type,
        `Streaming failed: ${errorMessage}`
      );
    }
  }

  /**
   * ============================================
   * RESPONSE PARSING
   * ============================================
   */

  /**
   * Parse OpenAI API response
   * 
   * Response structure:
   * {
   *   choices: [
   *     {
   *       message: {
   *         content: "response text here"
   *       }
   *     }
   *   ],
   *   usage: {
   *     prompt_tokens: 100,
   *     completion_tokens: 50,
   *     total_tokens: 150
   *   }
   * }
   * 
   * @param response - API response object
   * @returns Extracted text
   */
  private parseResponse(response: any): string {
    try {
      const text = response.choices?.[0]?.message?.content;

      if (!text) {
        throw new Error('No text in response');
      }

      return text;
    } catch (error) {
      console.error('[OpenAIProvider] Failed to parse response:', error);
      throw new AIProviderError(
        this.type,
        'Could not parse API response'
      );
    }
  }

  /**
   * ============================================
   * UTILITY METHODS
   * ============================================
   */

  /**
   * Generate unique ID for response
   * 
   * @returns Unique ID string
   */
  private generateId(): string {
    return `openai_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Store message in conversation history
   * 
   * @param request - User request
   * @param response - AI response
   */
  private storeInHistory(request: AIProviderRequest, response: string): void {
    const key = request.filePath;

    if (!this.conversationHistory.has(key)) {
      this.conversationHistory.set(key, []);
    }

    const history = this.conversationHistory.get(key)!;

    // Add user message
    history.push({
      role: 'user',
      content: request.question,
      timestamp: new Date(),
    });

    // Add assistant message
    history.push({
      role: 'assistant',
      content: response,
      timestamp: new Date(),
    });

    // Keep only last 10 messages
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }
  }

  /**
   * Get conversation history for a file
   * 
   * @param filePath - File path
   * @returns Conversation history
   */
  private getConversationHistory(filePath: string): ConversationMessage[] {
    return this.conversationHistory.get(filePath) || [];
  }

  /**
   * Clear all conversation history
   */
  clearConversationHistory(): void {
    this.conversationHistory.clear();
    console.log('[OpenAIProvider] Conversation history cleared');
  }
}
