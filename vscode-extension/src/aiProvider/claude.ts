import Anthropic from '@anthropic-ai/sdk';
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
 * CLAUDE PROVIDER
 * ============================================
 * 
 * Anthropic Claude AI Provider Implementation
 * Docs: https://docs.anthropic.com/
 * 
 * Features:
 * - Best for complex reasoning
 * - Excellent code understanding
 * - Supports streaming
 * - Multi-turn conversations
 * - Vision capabilities (optional)
 * 
 * Models:
 * - claude-3-5-sonnet (Recommended) - Fastest, best value
 * - claude-3-opus - Smartest, slowest
 * - claude-3-haiku - Fastest, most compact
 * 
 * Capabilities:
 * - Context window: 200k tokens
 * - Max output: 4k tokens
 * - Temperature: 0-1 (default 1)
 * - Pricing: ~$3/$15 per million tokens
 */
export class ClaudeProvider implements IAIProvider {
  /**
   * Provider type identifier
   */
  private readonly type = AIProviderType.CLAUDE;

  /**
   * Anthropic SDK client
   * Initialized when API key is available
   */
  private client: Anthropic | null = null;

  /**
   * Model to use
   * Options: claude-3-5-sonnet, claude-3-opus, claude-3-haiku
   */
  private readonly MODEL = 'claude-3-5-sonnet-20241022';

  /**
   * API key (loaded from credential store)
   */
  private apiKey: string | null = null;

  /**
   * Conversation history for multi-turn support
   * Maps error ID to conversation history
   */
  private conversationHistory: Map<string, ConversationMessage[]> = new Map();

  /**
   * Provider capabilities (static)
   */
  private readonly capabilities: AIProviderCapabilities = {
    isAvailable: false, // Determined after checking API key
    requiresApiKey: true,
    maxContextWindow: 200000, // tokens - Claude's huge context window
    defaultMaxTokens: 2000,
    supportsStreaming: true,
    costPerMillion: {
      input: 3, // $3 per million input tokens
      output: 15, // $15 per million output tokens
    },
    description: 'Anthropic Claude 3.5 Sonnet - Best reasoning, excellent for code',
  };

  /**
   * Constructor
   */
  constructor() {
    console.log('[ClaudeProvider] Initialized');
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
   * Loads API key from credential store and initializes client
   * 
   * @returns true if API key configured and client initialized
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Load API key from credential store
      const credentialManager = getCredentialManager();
      this.apiKey = await credentialManager.getCredential(this.type);

      if (!this.apiKey) {
        console.log('[ClaudeProvider] No API key configured');
        return false;
      }

      // Initialize Anthropic client with API key
      this.client = new Anthropic({
        apiKey: this.apiKey,
      });

      console.log('[ClaudeProvider] ✅ API key found, client initialized');
      return true;
    } catch (error) {
      console.error('[ClaudeProvider] Error checking availability:', error);
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
   * Send request to Claude API
   * 
   * @param request - The debugging question request
   * @returns Response from Claude
   * 
   * @example
   * const response = await claudeProvider.sendRequest({
   *   question: "Why is this error happening?",
   *   codeContext: "const x: number = 'string';",
   *   errorMessage: "Type 'string' is not assignable to type 'number'",
   *   filePath: "app.ts",
   *   errorType: "type"
   * });
   * 
   * Flow:
   * 1. Validate API key and client
   * 2. Build prompt from template
   * 3. Get conversation history (if any)
   * 4. Send to Claude API
   * 5. Parse response
   * 6. Store in conversation history
   * 7. Return formatted response
   */
  async sendRequest(request: AIProviderRequest): Promise<AIProviderResponse> {
    const startTime = Date.now();

    try {
      console.log('[ClaudeProvider] Sending request...');

      // Validate
      if (!this.client || !this.apiKey) {
        throw new AIProviderError(
          this.type,
          'Claude not configured. Please add your API key in settings.'
        );
      }

      // Build prompt
      const prompt = this.buildPrompt(request);
      console.log('[ClaudeProvider] Prompt built, length:', prompt.length);

      // Get conversation history
      const history = this.getConversationHistory(request.filePath);

      // Build messages array (Claude requires this format)
      const messages = this.buildMessages(prompt, history);

      // Call Claude API
      const response = await this.client.messages.create({
        model: this.MODEL,
        max_tokens: request.maxTokens || this.capabilities.defaultMaxTokens,
        system: DEFAULT_PROMPT_TEMPLATE.system,
        messages: messages,
      });

      // Parse response
      const responseText = this.parseResponse(response);

      // Store in history
      this.storeInHistory(request, responseText);

      // Calculate token usage
      const tokenUsage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      };

      const responseTime = Date.now() - startTime;

      console.log(`[ClaudeProvider] ✅ Request successful (${responseTime}ms)`);

      return {
        id: this.generateId(),
        text: responseText,
        provider: this.type,
        responseTime,
        timestamp: new Date(),
        tokenUsage,
        success: true,
        stopReason: response.stop_reason,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error('[ClaudeProvider] ❌ Request failed:', errorMessage);

      // Handle specific errors
      let friendlyMessage = errorMessage;
      if (errorMessage.includes('401')) {
        friendlyMessage = 'Invalid API key. Please check your Claude API key.';
      } else if (errorMessage.includes('429')) {
        friendlyMessage = 'Rate limit exceeded. Please try again in a moment.';
      } else if (errorMessage.includes('503')) {
        friendlyMessage = 'Claude API is temporarily unavailable. Please try again later.';
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
   * let fullResponse = '';
   * await claudeProvider.sendRequestStream(request, (chunk) => {
   *   fullResponse += chunk;
   *   updateUI(chunk);
   * });
   */
  async sendRequestStream(
    request: AIProviderRequest,
    onChunk: (chunk: string) => void
  ): Promise<AIProviderResponse> {
    const startTime = Date.now();

    try {
      console.log('[ClaudeProvider] Sending streaming request...');

      if (!this.client || !this.apiKey) {
        throw new AIProviderError(this.type, 'Claude not configured');
      }

      const prompt = this.buildPrompt(request);
      const history = this.getConversationHistory(request.filePath);
      const messages = this.buildMessages(prompt, history);

      // Create streaming message
      let fullText = '';
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      const stream = await this.client.messages.create({
        model: this.MODEL,
        max_tokens: request.maxTokens || this.capabilities.defaultMaxTokens,
        system: DEFAULT_PROMPT_TEMPLATE.system,
        messages: messages,
        stream: true, // Enable streaming
      });

      // Process stream events
      for await (const event of stream) {
        // Handle different event types
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const text = event.delta.text;
            fullText += text;
            onChunk(text); // Call callback for UI update
          }
        } else if (event.type === 'message_start') {
          // Message started
          console.log('[ClaudeProvider] Streaming started');
        } else if (event.type === 'message_delta') {
          // Final message stats
          if (event.usage) {
            totalOutputTokens = event.usage.output_tokens;
          }
        }
      }

      // Store in history
      this.storeInHistory(request, fullText);

      const responseTime = Date.now() - startTime;
      console.log(`[ClaudeProvider] ✅ Streaming complete (${responseTime}ms)`);

      return {
        id: this.generateId(),
        text: fullText,
        provider: this.type,
        responseTime,
        timestamp: new Date(),
        tokenUsage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
        },
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ClaudeProvider] Streaming failed:', errorMessage);

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
      console.log('[ClaudeProvider] Validating configuration...');

      // Check if API key available
      const credentialManager = getCredentialManager();
      const apiKey = await credentialManager.getCredential(this.type);

      if (!apiKey) {
        return {
          valid: false,
          error: 'No API key configured. Add your Claude API key in settings.',
        };
      }

      this.apiKey = apiKey;

      // Initialize client
      this.client = new Anthropic({
        apiKey: this.apiKey,
      });

      // Test API connection with a simple request
      try {
        const response = await this.client.messages.create({
          model: this.MODEL,
          max_tokens: 50,
          messages: [
            {
              role: 'user',
              content: 'Say "OK" if you can understand this.',
            },
          ],
        });

        if (response.content[0].type === 'text' && response.content[0].text) {
          console.log('[ClaudeProvider] ✅ Validation successful');
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

      // Initialize client
      this.client = new Anthropic({
        apiKey: this.apiKey,
      });

      console.log('[ClaudeProvider] ✅ Credentials updated');
    } catch (error) {
      console.error('[ClaudeProvider] Failed to set credentials:', error);
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
      this.client = null;

      console.log('[ClaudeProvider] ✅ Credentials cleared');
    } catch (error) {
      console.error('[ClaudeProvider] Failed to clear credentials:', error);
      throw error;
    }
  }

  /**
   * ============================================
   * INTERNAL METHODS
   * ============================================
   */

  /**
   * Build prompt from template and request
   * 
   * @param request - Request with error details
   * @returns Complete prompt string
   */
  private buildPrompt(request: AIProviderRequest): string {
    let prompt = DEFAULT_PROMPT_TEMPLATE.user;

    // Replace template variables
    prompt = prompt.replace('{errorType}', request.errorType);
    prompt = prompt.replace('{filePath}', request.filePath);
    prompt = prompt.replace('{errorMessage}', request.errorMessage);
    prompt = prompt.replace('{codeContext}', request.codeContext);
    prompt = prompt.replace('{question}', request.question);

    return prompt;
  }

  /**
   * Build messages array for Claude API
   * Claude expects array of messages with role and content
   * 
   * Format:
   * [
   *   { role: "user", content: "message 1" },
   *   { role: "assistant", content: "response 1" },
   *   { role: "user", content: "new message" }
   * ]
   * 
   * @param currentPrompt - Current user prompt
   * @param history - Conversation history
   * @returns Messages array
   */
  private buildMessages(
    currentPrompt: string,
    history: ConversationMessage[]
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Add conversation history
    for (const msg of history) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // Add current prompt as new user message
    messages.push({
      role: 'user',
      content: currentPrompt,
    });

    return messages;
  }

  /**
   * Parse Claude API response
   * Extract text from response structure
   * 
   * Response structure:
   * {
   *   content: [
   *     { type: "text", text: "response here" }
   *   ],
   *   usage: { input_tokens: 100, output_tokens: 50 }
   * }
   * 
   * @param response - API response object
   * @returns Extracted text
   */
  private parseResponse(response: any): string {
    try {
      // Claude response is array of content blocks
      const textBlock = response.content.find(
        (block: any) => block.type === 'text'
      );

      if (!textBlock || !textBlock.text) {
        throw new Error('No text in response');
      }

      return textBlock.text;
    } catch (error) {
      console.error('[ClaudeProvider] Failed to parse response:', error);
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
    return `claude_${Date.now()}_${Math.random().toString(36).substring(7)}`;
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
    console.log('[ClaudeProvider] Conversation history cleared');
  }
}
