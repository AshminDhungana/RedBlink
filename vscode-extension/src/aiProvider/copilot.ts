
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

/**
 * ============================================
 * GITHUB COPILOT PROVIDER
 * ============================================
 * 
 * VS Code Language Model API Provider
 * Uses GitHub Copilot's built-in models
 * Docs: https://code.visualstudio.com/docs/editor/artificial-intelligence
 * 
 * Features:
 * - NO API key required (uses VS Code auth)
 * - Free for GitHub Copilot subscribers
 * - Integrated with VS Code settings
 * - Automatically handles rate limiting
 * - Streaming support
 * 
 * Models Available (automatic):
 * - claude-3.5-sonnet
 * - gpt-4o
 * - Other models as VS Code updates
 * 
 * Requirements:
 * - GitHub Copilot extension installed
 * - GitHub Copilot subscription OR free tier
 * - VS Code 1.93+
 * 
 * Capabilities:
 * - Context window: Based on model
 * - Max output: Based on model
 * - Temperature: Limited control
 * - Streaming: ✅ Yes
 */
export class CopilotProvider implements IAIProvider {
  /**
   * Provider type identifier
   */
  private readonly type = AIProviderType.COPILOT;

  /**
   * VS Code Language Model interface
   * Provided by VS Code if Copilot extension is installed
   */
  private lmInterface: vscode.LanguageModelAccess | null = null;

  /**
   * Whether Copilot extension is available
   * Checked on initialization
   */
  private isExtensionAvailable: boolean = false;

  /**
   * Conversation history for multi-turn support
   */
  private conversationHistory: Map<string, ConversationMessage[]> = new Map();

  /**
   * Provider capabilities
   */
  private readonly capabilities: AIProviderCapabilities = {
    isAvailable: false,
    requiresApiKey: false, // No API key needed!
    maxContextWindow: 128000, // Depends on model
    defaultMaxTokens: 2000,
    supportsStreaming: true,
    costPerMillion: undefined, // Free with subscription
    description: 'GitHub Copilot - No API key needed, built into VS Code',
  };

  /**
   * Constructor
   * 
   * Note: This provider is unique because it depends on
   * VS Code extensions being available. We check availability
   * in the isAvailable() method.
   */
  constructor() {
    console.log('[CopilotProvider] Initialized');
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
   * 
   * For Copilot, this means:
   * 1. GitHub Copilot extension is installed
   * 2. User has authenticated with GitHub
   * 3. User has valid Copilot subscription (or free tier)
   * 
   * @returns true if Copilot is available
   * 
   * Note: This check is async because it queries
   * VS Code's extension system
   */
  async isAvailable(): Promise<boolean> {
    try {
      console.log('[CopilotProvider] Checking Copilot availability...');

      // Try to get GitHub Copilot extension
      const copilotExtension = vscode.extensions.getExtension('GitHub.copilot');

      if (!copilotExtension) {
        console.log('[CopilotProvider] ⚠️ Copilot extension not installed');
        console.log('   Install: GitHub Copilot extension from VS Code marketplace');
        this.isExtensionAvailable = false;
        return false;
      }

      // Activate extension if not already active
      if (!copilotExtension.isActive) {
        await copilotExtension.activate();
      }

      console.log('[CopilotProvider] ✅ Copilot extension found and active');

      // Try to get language model access
      // This is experimental API, may change in future VS Code versions
      try {
        // Try to use the Language Model API
        // This will fail gracefully if not available
        this.lmInterface = await vscode.lm.selectLanguageModels({
          vendor: 'copilot',
          family: 'gpt-4',
        });

        if (this.lmInterface && this.lmInterface.length > 0) {
          console.log('[CopilotProvider] ✅ Language models available');
          this.isExtensionAvailable = true;
          return true;
        } else {
          console.log('[CopilotProvider] ⚠️ No language models available');
          console.log('   Check: Do you have an active GitHub Copilot subscription?');
          return false;
        }
      } catch (error) {
        console.log('[CopilotProvider] Language Model API not available (may be VS Code version)');
        console.log('   Update VS Code to 1.93+ for full Copilot support');

        // Even if LM API isn't available, we can still mark it as potentially available
        // User may enable it through settings later
        this.isExtensionAvailable = true;
        return true; // Assume available, will fail gracefully on use
      }
    } catch (error) {
      console.error('[CopilotProvider] Error checking availability:', error);
      this.isExtensionAvailable = false;
      return false;
    }
  }

  /**
   * Get provider capabilities
   */
  getCapabilities(): AIProviderCapabilities {
    return {
      ...this.capabilities,
      isAvailable: this.isExtensionAvailable,
      description: 'GitHub Copilot - Free for subscribers, built-in to VS Code',
    };
  }

  /**
   * ============================================
   * MAIN REQUEST HANDLING
   * ============================================
   */

  /**
   * Send request to Copilot
   * 
   * @param request - The debugging question request
   * @returns Response from Copilot
   * 
   * @example
   * const response = await copilotProvider.sendRequest({
   *   question: "Why is this error happening?",
   *   codeContext: "const x: number = 'string';",
   *   errorMessage: "Type 'string' is not assignable to type 'number'",
   *   filePath: "app.ts",
   *   errorType: "type"
   * });
   * 
   * Flow:
   * 1. Check Copilot is available
   * 2. Build prompt
   * 3. Get conversation history
   * 4. Call language model
   * 5. Parse response
   * 6. Store in history
   * 7. Return response
   */
  async sendRequest(request: AIProviderRequest): Promise<AIProviderResponse> {
    const startTime = Date.now();

    try {
      console.log('[CopilotProvider] Sending request...');

      // Validate
      if (!this.isExtensionAvailable) {
        throw new AIProviderError(
          this.type,
          'GitHub Copilot extension not available. Install it from VS Code marketplace.'
        );
      }

      // Build prompt
      const prompt = this.buildPrompt(request);
      console.log('[CopilotProvider] Prompt built');

      // Get conversation history
      const history = this.getConversationHistory(request.filePath);

      // Build messages
      const messages = this.buildMessages(prompt, history);

      // Call language model
      const responseText = await this.callCopilotLM(
        messages,
        request.maxTokens
      );

      // Store in history
      this.storeInHistory(request, responseText);

      // Token usage estimate (Copilot doesn't provide exact counts)
      const tokenUsage = this.estimateTokenUsage(prompt, responseText);
      const responseTime = Date.now() - startTime;

      console.log(`[CopilotProvider] ✅ Request successful (${responseTime}ms)`);

      return {
        id: this.generateId(),
        text: responseText,
        provider: this.type,
        responseTime,
        timestamp: new Date(),
        tokenUsage,
        success: true,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error('[CopilotProvider] ❌ Request failed:', errorMessage);

      // Provide helpful error messages
      let friendlyMessage = errorMessage;
      if (errorMessage.includes('not installed')) {
        friendlyMessage = 'GitHub Copilot extension not installed. Install it from VS Code marketplace.';
      } else if (errorMessage.includes('rate limit')) {
        friendlyMessage = 'Rate limit exceeded. Please try again in a moment.';
      } else if (errorMessage.includes('subscription')) {
        friendlyMessage = 'GitHub Copilot subscription required.';
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
   * await copilotProvider.sendRequestStream(request, (chunk) => {
   *   console.log(chunk);
   *   updateUI(chunk);
   * });
   */
  async sendRequestStream(
    request: AIProviderRequest,
    onChunk: (chunk: string) => void
  ): Promise<AIProviderResponse> {
    const startTime = Date.now();

    try {
      console.log('[CopilotProvider] Sending streaming request...');

      if (!this.isExtensionAvailable) {
        throw new AIProviderError(
          this.type,
          'GitHub Copilot extension not available'
        );
      }

      const prompt = this.buildPrompt(request);
      const history = this.getConversationHistory(request.filePath);
      const messages = this.buildMessages(prompt, history);

      // Call with streaming
      const responseText = await this.callCopilotLMStreaming(
        messages,
        request.maxTokens,
        onChunk
      );

      // Store in history
      this.storeInHistory(request, responseText);

      const tokenUsage = this.estimateTokenUsage(prompt, responseText);
      const responseTime = Date.now() - startTime;

      console.log(`[CopilotProvider] ✅ Streaming complete (${responseTime}ms)`);

      return {
        id: this.generateId(),
        text: responseText,
        provider: this.type,
        responseTime,
        timestamp: new Date(),
        tokenUsage,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[CopilotProvider] Streaming failed:', errorMessage);

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
   * 
   * Note: Copilot uses VS Code's authentication
   * No credentials needed to be stored
   */

  /**
   * Validate provider is properly configured
   * 
   * For Copilot, this means checking if extension is installed
   */
  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      console.log('[CopilotProvider] Validating configuration...');

      const isAvailable = await this.isAvailable();

      if (!isAvailable) {
        return {
          valid: false,
          error: 'GitHub Copilot extension not installed or not authenticated',
        };
      }

      // Try a simple test request
      try {
        const testResponse = await this.callCopilotLM(
          [
            {
              role: 'user',
              content: 'Say "OK" if you can understand this.',
            },
          ],
          50
        );

        if (testResponse && testResponse.length > 0) {
          console.log('[CopilotProvider] ✅ Validation successful');
          return { valid: true };
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          valid: false,
          error: `Copilot test failed: ${msg}`,
        };
      }

      return { valid: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { valid: false, error: errorMessage };
    }
  }

  /**
   * Set credentials (not applicable for Copilot)
   * Copilot uses VS Code authentication
   * This method is here for interface compliance
   */
  async setCredentials(config: AIProviderConfig): Promise<void> {
    console.log('[CopilotProvider] setCredentials called (not applicable for Copilot)');
    console.log('   Copilot uses VS Code authentication');
    // No-op for Copilot
  }

  /**
   * Clear credentials (not applicable for Copilot)
   * This method is here for interface compliance
   */
  async clearCredentials(): Promise<void> {
    console.log('[CopilotProvider] clearCredentials called (not applicable for Copilot)');
    // No-op for Copilot
  }

  /**
   * ============================================
   * INTERNAL METHODS
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
   * Build messages array for Language Model API
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

    // Add system message as first user message
    messages.push({
      role: 'user',
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
   * Call Copilot Language Model (non-streaming)
   * 
   * Uses VS Code's Language Model API
   * 
   * @param messages - Messages array
   * @param maxTokens - Maximum tokens in response
   * @returns Response text
   * 
   * Note: This API is experimental and may change
   * Error handling is graceful
   */
  private async callCopilotLM(
    messages: Array<{ role: string; content: string }>,
    maxTokens?: number
  ): Promise<string> {
    try {
      console.log('[CopilotProvider] Calling Language Model API...');

      // Get available models
      let models: vscode.LanguageModelChat[];

      try {
        // Try to get Copilot models
        models = await vscode.lm.selectLanguageModels({
          vendor: 'copilot',
          family: 'gpt-4', // or other families
        });
      } catch (e) {
        console.log('[CopilotProvider] Could not select models, trying generic approach');
        // Fallback: try any available models
        models = await vscode.lm.selectLanguageModels({
          // No specific vendor/family
        });
      }

      if (!models || models.length === 0) {
        throw new Error('No language models available');
      }

      const model = models[0]; // Use first available model
      console.log(`[CopilotProvider] Using model: ${model.id}`);

      // Create language model message
      const lmMessages = messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

      // Call the model
      const response = await model.sendRequest(
        lmMessages,
        {},
        new vscode.CancellationTokenSource().token
      );

      // Extract text from response
      let fullText = '';
      for await (const chunk of response.text) {
        fullText += chunk;
      }

      console.log('[CopilotProvider] ✅ Response received');
      return fullText;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[CopilotProvider] LM call failed:', errorMessage);
      throw new AIProviderError(
        this.type,
        `Failed to call Copilot: ${errorMessage}`
      );
    }
  }

  /**
   * Call Copilot Language Model with streaming
   * 
   * Streams response chunks as they arrive
   * 
   * @param messages - Messages array
   * @param maxTokens - Maximum tokens
   * @param onChunk - Callback for each chunk
   * @returns Full response text
   */
  private async callCopilotLMStreaming(
    messages: Array<{ role: string; content: string }>,
    maxTokens: number | undefined,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    try {
      console.log('[CopilotProvider] Calling Language Model API (streaming)...');

      // Get available models
      const models = await vscode.lm.selectLanguageModels({
        vendor: 'copilot',
      });

      if (!models || models.length === 0) {
        throw new Error('No language models available');
      }

      const model = models[0];

      // Create messages
      const lmMessages = messages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

      // Call with streaming
      const response = await model.sendRequest(
        lmMessages,
        {},
        new vscode.CancellationTokenSource().token
      );

      // Collect streamed chunks
      let fullText = '';
      for await (const chunk of response.text) {
        fullText += chunk;
        onChunk(chunk); // Call callback for UI update
      }

      console.log('[CopilotProvider] ✅ Streaming complete');
      return fullText;
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
   * UTILITY METHODS
   * ============================================
   */

  /**
   * Estimate token usage
   * Copilot doesn't provide token counts
   * 
   * @param prompt - Input text
   * @param response - Output text
   * @returns Estimated token usage
   */
  private estimateTokenUsage(
    prompt: string,
    response: string
  ): { inputTokens: number; outputTokens: number; totalTokens: number } {
    // Simple estimate: 4 characters per token
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(response.length / 4);

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `copilot_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Store message in conversation history
   */
  private storeInHistory(request: AIProviderRequest, response: string): void {
    const key = request.filePath;

    if (!this.conversationHistory.has(key)) {
      this.conversationHistory.set(key, []);
    }

    const history = this.conversationHistory.get(key)!;

    history.push({
      role: 'user',
      content: request.question,
      timestamp: new Date(),
    });

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
   * Get conversation history
   */
  private getConversationHistory(filePath: string): ConversationMessage[] {
    return this.conversationHistory.get(filePath) || [];
  }

  /**
   * Clear conversation history
   */
  clearConversationHistory(): void {
    this.conversationHistory.clear();
    console.log('[CopilotProvider] Conversation history cleared');
  }
}
