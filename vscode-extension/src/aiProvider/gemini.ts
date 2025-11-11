

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
 * GEMINI PROVIDER
 * ============================================
 * 
 * Google Gemini AI Provider Implementation
 * Docs: https://ai.google.dev/tutorials/node_quickstart
 * 
 * Features:
 * - Free tier available (12 requests/minute)
 * - Supports streaming responses
 * - Excellent code understanding
 * - Multi-turn conversations
 * 
 * Capabilities:
 * - Model: Gemini Pro (gemini-pro)
 * - Context window: 32k tokens
 * - Max output: 4k tokens
 * - Temperature: 0-2 (default 0.7)
 */
export class GeminiProvider implements IAIProvider {
  /**
   * Provider type identifier
   */
  private readonly type = AIProviderType.GEMINI;

  /**
   * Gemini API endpoint
   * Format: https://generativelanguage.googleapis.com/v1beta/models/{model}:{method}?key={API_KEY}
   */
  private readonly API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

  /**
   * Model to use
   * Options: gemini-pro, gemini-1.5-pro, gemini-1.5-flash
   */
  private readonly MODEL = 'gemini-pro';

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
   * Provider capabilities (static - doesn't change)
   */
  private readonly capabilities: AIProviderCapabilities = {
    isAvailable: false, // Will be determined after checking API key
    requiresApiKey: true,
    maxContextWindow: 32000, // tokens
    defaultMaxTokens: 2000,
    supportsStreaming: true,
    costPerMillion: {
      input: 0.5, // $0.50 per million input tokens
      output: 1.5, // $1.50 per million output tokens
    },
    description: 'Google Gemini AI - Free tier available, excellent for code understanding',
  };

  /**
   * Constructor
   * Initializes provider but doesn't connect yet
   * Connection happens in validate()
   */
  constructor() {
    console.log('[GeminiProvider] Initialized');
  }

  /**
   * ============================================
   * INTERFACE IMPLEMENTATION
   * ============================================
   */

  /**
   * Get provider type
   * @returns AIProviderType.GEMINI
   */
  getType(): AIProviderType {
    return this.type;
  }

  /**
   * Check if provider is available and ready to use
   * 
   * @returns true if API key is configured, false otherwise
   * 
   * @example
   * if (await geminiProvider.isAvailable()) {
   *   // Can use this provider
   * }
   */
  async isAvailable(): Promise<boolean> {
    try {
      // Try to load API key from credential store
      const credentialManager = getCredentialManager();
      this.apiKey = await credentialManager.getCredential(this.type);

      if (!this.apiKey) {
        console.log('[GeminiProvider] No API key configured');
        return false;
      }

      console.log('[GeminiProvider] ✅ API key found');
      return true;
    } catch (error) {
      console.error('[GeminiProvider] Error checking availability:', error);
      return false;
    }
  }

  /**
   * Get provider capabilities
   * Describes what this provider can do
   * 
   * @returns Capabilities object
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
   * Send request to Gemini API (non-streaming)
   * 
   * @param request - The debugging question request
   * @returns Response from Gemini
   * 
   * @example
   * const response = await geminiProvider.sendRequest({
   *   question: "Why is this error happening?",
   *   codeContext: "const x: number = 'string';",
   *   errorMessage: "Type 'string' is not assignable to type 'number'",
   *   filePath: "app.ts",
   *   errorType: "type"
   * });
   * console.log(response.text); // AI response
   * 
   * Flow:
   * 1. Validate API key is available
   * 2. Build prompt from template
   * 3. Call Gemini API
   * 4. Parse response
   * 5. Store in conversation history
   * 6. Return formatted response
   */
  async sendRequest(request: AIProviderRequest): Promise<AIProviderResponse> {
    const startTime = Date.now();

    try {
      console.log('[GeminiProvider] Sending request...');

      // Validate
      if (!this.apiKey) {
        throw new AIProviderError(
          this.type,
          'API key not configured. Please add your Gemini API key in settings.'
        );
      }

      // Build prompt
      const prompt = this.buildPrompt(request);
      console.log('[GeminiProvider] Prompt built, length:', prompt.length);

      // Call Gemini API
      const apiResponse = await this.callGeminiAPI(prompt, request.maxTokens);

      // Parse response
      const responseText = this.parseResponse(apiResponse);

      // Store in conversation history for multi-turn support
      this.storeInHistory(request, responseText);

      // Calculate token usage
      const tokenUsage = this.estimateTokenUsage(prompt, responseText);
      const responseTime = Date.now() - startTime;

      console.log(`[GeminiProvider] ✅ Request successful (${responseTime}ms)`);

      // Return formatted response
      return {
        id: this.generateId(),
        text: responseText,
        provider: this.type,
        responseTime,
        timestamp: new Date(),
        tokenUsage,
        success: true,
        stopReason: apiResponse.candidates?.[0]?.finishReason,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error('[GeminiProvider] ❌ Request failed:', errorMessage);

      return {
        id: this.generateId(),
        text: '',
        provider: this.type,
        responseTime,
        timestamp: new Date(),
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send request with streaming response
   * Response is streamed chunk by chunk
   * 
   * @param request - The request
   * @param onChunk - Callback function for each chunk
   * @returns Complete response
   * 
   * @example
   * let fullResponse = '';
   * await geminiProvider.sendRequestStream(request, (chunk) => {
   *   fullResponse += chunk;
   *   updateUIWithChunk(chunk); // Update UI in real-time
   * });
   * 
   * Flow:
   * 1. Build prompt
   * 2. Call Gemini streaming API
   * 3. For each chunk received:
   *    - Parse chunk
   *    - Call onChunk callback
   *    - Accumulate full response
   * 4. Return complete response
   */
  async sendRequestStream(
    request: AIProviderRequest,
    onChunk: (chunk: string) => void
  ): Promise<AIProviderResponse> {
    const startTime = Date.now();

    try {
      console.log('[GeminiProvider] Sending streaming request...');

      if (!this.apiKey) {
        throw new AIProviderError(this.type, 'API key not configured');
      }

      const prompt = this.buildPrompt(request);

      // Call streaming API
      const response = await this.callGeminiStreamingAPI(
        prompt,
        request.maxTokens,
        onChunk
      );

      // Store in history
      this.storeInHistory(request, response.fullText);

      const tokenUsage = this.estimateTokenUsage(prompt, response.fullText);
      const responseTime = Date.now() - startTime;

      console.log(`[GeminiProvider] ✅ Streaming complete (${responseTime}ms)`);

      return {
        id: this.generateId(),
        text: response.fullText,
        provider: this.type,
        responseTime,
        timestamp: new Date(),
        tokenUsage,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[GeminiProvider] Streaming failed:', errorMessage);

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
   * 
   * @example
   * const validation = await geminiProvider.validate();
   * if (!validation.valid) {
   *   console.error('Configuration error:', validation.error);
   * }
   */
  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      console.log('[GeminiProvider] Validating configuration...');

      // Check if API key available
      const credentialManager = getCredentialManager();
      const apiKey = await credentialManager.getCredential(this.type);

      if (!apiKey) {
        return {
          valid: false,
          error: 'No API key configured. Add your Gemini API key in settings.',
        };
      }

      this.apiKey = apiKey;

      // Test API connection with a simple request
      const testPrompt = 'Say "OK" if you can understand this.';

      try {
        const response = await this.callGeminiAPI(testPrompt, 10);
        const text = this.parseResponse(response);

        if (text && text.length > 0) {
          console.log('[GeminiProvider] ✅ Validation successful');
          return { valid: true };
        }
      } catch (error) {
        return {
          valid: false,
          error: `API connection failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }

      return { valid: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Set API key and other credentials
   * 
   * @param config - Configuration with API key
   * @example
   * await geminiProvider.setCredentials({
   *   type: AIProviderType.GEMINI,
   *   apiKey: 'your-api-key-here'
   * });
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

      console.log('[GeminiProvider] ✅ Credentials updated');
    } catch (error) {
      console.error('[GeminiProvider] Failed to set credentials:', error);
      throw error;
    }
  }

  /**
   * Clear stored credentials
   * 
   * @example
   * await geminiProvider.clearCredentials();
   */
  async clearCredentials(): Promise<void> {
    try {
      const credentialManager = getCredentialManager();
      await credentialManager.deleteCredential(this.type);
      this.apiKey = null;

      console.log('[GeminiProvider] ✅ Credentials cleared');
    } catch (error) {
      console.error('[GeminiProvider] Failed to clear credentials:', error);
      throw error;
    }
  }

  /**
   * ============================================
   * INTERNAL API METHODS
   * ============================================
   */

  /**
   * Build prompt from template and request
   * Fills in template with actual error details
   * 
   * Template variables replaced:
   * - {errorType}: Type of error
   * - {filePath}: File where error occurred
   * - {errorMessage}: Error message
   * - {codeContext}: Code around error
   * - {question}: User's question
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
   * Call Gemini API (non-streaming)
   * Makes HTTP request to Google's API
   * 
   * @param prompt - Prompt to send
   * @param maxTokens - Maximum response tokens
   * @returns Parsed API response
   * 
   * HTTP Request:
   * POST https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=API_KEY
   * 
   * Body:
   * {
   *   "contents": [
   *     {
   *       "role": "user",
   *       "parts": [{ "text": "prompt here" }]
   *     }
   *   ],
   *   "generationConfig": {
   *     "maxOutputTokens": 2000,
   *     "temperature": 0.7
   *   },
   *   "safetySettings": [...]
   * }
   */
  private async callGeminiAPI(
    prompt: string,
    maxTokens?: number
  ): Promise<any> {
    const url = `${this.API_ENDPOINT}/${this.MODEL}:generateContent?key=${this.apiKey}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: maxTokens || this.capabilities.defaultMaxTokens,
        temperature: 0.7, // Balanced: creative but accurate
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_UNSPECIFIED',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_DEROGATORY_CONTENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_VIOLENCE',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_SEXUAL_CONTENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_MEDICAL_CONTENT',
          threshold: 'BLOCK_NONE',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_NONE',
        },
      ],
    };

    try {
      console.log('[GeminiProvider] Making API request to:', url.split('?')[0] + '?key=***');

      // Make HTTP request using fetch
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      // Check response status
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `API Error ${response.status}: ${
            errorData.error?.message || response.statusText
          }`
        );
      }

      const data = await response.json();
      console.log('[GeminiProvider] API response received');

      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[GeminiProvider] API call failed:', errorMessage);
      throw new AIProviderError(
        this.type,
        `Failed to call Gemini API: ${errorMessage}`
      );
    }
  }

  /**
   * Call Gemini API with streaming
   * Streams response chunks as they arrive
   * 
   * @param prompt - Prompt to send
   * @param maxTokens - Maximum response tokens
   * @param onChunk - Callback for each chunk
   * @returns Object with full accumulated text
   * 
   * Uses Server-Sent Events (SSE) format
   */
  private async callGeminiStreamingAPI(
    prompt: string,
    maxTokens: number | undefined,
    onChunk: (chunk: string) => void
  ): Promise<{ fullText: string }> {
    const url = `${this.API_ENDPOINT}/${this.MODEL}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens: maxTokens || this.capabilities.defaultMaxTokens,
        temperature: 0.7,
      },
    };

    let fullText = '';

    try {
      console.log('[GeminiProvider] Making streaming API request...');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6);
              const chunk = JSON.parse(jsonStr);

              if (
                chunk.candidates?.[0]?.content?.parts?.[0]?.text
              ) {
                const text = chunk.candidates[0].content.parts[0].text;
                fullText += text;
                onChunk(text); // Call callback for UI update
              }
            } catch (e) {
              console.log('[GeminiProvider] Could not parse chunk:', line);
            }
          }
        }

        // Keep incomplete line for next iteration
        buffer = lines[lines.length - 1];
      }

      return { fullText };
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
   * Parse Gemini API response
   * Extracts text from response structure
   * 
   * Response structure:
   * {
   *   candidates: [
   *     {
   *       content: {
   *         parts: [
   *           { text: "response text here" }
   *         ]
   *       }
   *     }
   *   ]
   * }
   * 
   * @param response - API response object
   * @returns Extracted text
   */
  private parseResponse(response: any): string {
    try {
      const text = response.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error('No text in response');
      }

      return text;
    } catch (error) {
      console.error('[GeminiProvider] Failed to parse response:', error);
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
   * Estimate token usage (Gemini doesn't always provide exact counts)
   * Rule of thumb: ~4 characters per token
   * 
   * @param prompt - Input prompt
   * @param response - Output response
   * @returns Token usage estimate
   */
  private estimateTokenUsage(
    prompt: string,
    response: string
  ): { inputTokens: number; outputTokens: number; totalTokens: number } {
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(response.length / 4);

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }

  /**
   * Generate unique ID for response
   * Format: "gemini_timestamp_random"
   * 
   * @returns Unique ID string
   */
  private generateId(): string {
    return `gemini_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Store message in conversation history
   * Enables multi-turn conversations
   * 
   * @param request - User request
   * @param response - AI response
   */
  private storeInHistory(request: AIProviderRequest, response: string): void {
    const key = request.filePath; // Use file as conversation key

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

    // Keep only last 10 messages (prevent memory issues)
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }
  }

  /**
   * Get conversation history for a file
   * Useful for follow-up questions
   * 
   * @param filePath - File path
   * @returns Conversation history
   */
  getConversationHistory(filePath: string): ConversationMessage[] {
    return this.conversationHistory.get(filePath) || [];
  }

  /**
   * Clear conversation history
   * 
   * @example
   * geminiProvider.clearConversationHistory();
   */
  clearConversationHistory(): void {
    this.conversationHistory.clear();
    console.log('[GeminiProvider] Conversation history cleared');
  }
}
