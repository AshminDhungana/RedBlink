

import { AIProviderType, IAIProvider, AIProviderRequest, AIProviderResponse, ProviderManagerConfig, DEFAULT_PROVIDER_CONFIG, AIProviderError } from './types';
import { getCredentialManager } from './credentialManager';
import { GeminiProvider } from './gemini';
import { ClaudeProvider } from './claude';
import { OpenAIProvider } from './openai';
import { CopilotProvider } from './copilot';

/**
 * ============================================
 * PROVIDER MANAGER (FACTORY PATTERN)
 * ============================================
 * 
 * Central manager for all AI providers
 * Responsibilities:
 * 1. Create provider instances
 * 2. Manage provider lifecycle (initialization, cleanup)
 * 3. Switch between providers
 * 4. Handle fallback if provider fails
 * 5. Cache responses
 * 6. Retry failed requests
 * 
 * Flow:
 * User sends question
 *   → ProviderManager.sendRequest()
 *   → Gets active provider instance
 *   → Provider sends to API
 *   → Response cached
 *   → User gets response
 */
export class ProviderManager {
  /**
   * Instances of each provider (created on demand)
   * Lazy loading - only create when needed
   */
  private providers: Map<AIProviderType, IAIProvider> = new Map();

  /**
   * Currently active provider
   */
  private activeProvider: AIProviderType;

  /**
   * Manager configuration
   */
  private config: ProviderManagerConfig;

  /**
   * Response cache to avoid duplicate API calls
   * Key: hash of request, Value: response
   */
  private responseCache: Map<string, AIProviderResponse> = new Map();

  /**
   * Cache TTL in milliseconds (5 minutes)
   */
  private readonly CACHE_TTL = 5 * 60 * 1000;

  /**
   * Request queue for retry logic
   * Stores failed requests to retry later
   */
  private requestQueue: {
    request: AIProviderRequest;
    retries: number;
    lastAttempt: Date;
  }[] = [];

  /**
   * Retry delay in milliseconds (starts at 1 second, exponential backoff)
   */
  private readonly RETRY_DELAY = 1000;

  /**
   * Constructor
   * @param config - Configuration for the manager
   */
  constructor(config: Partial<ProviderManagerConfig> = {}) {
    this.config = {
      ...DEFAULT_PROVIDER_CONFIG,
      ...config,
    };

    this.activeProvider = this.config.defaultProvider;

    console.log('[ProviderManager] Initialized with config:', this.config);
  }

  /**
   * ============================================
   * INITIALIZATION
   * ============================================
   */

  /**
   * Initialize all enabled providers
   * Called once when extension starts
   * 
   * @example
   * await providerManager.initialize();
   */
  async initialize(): Promise<void> {
    console.log('[ProviderManager] Initializing providers...');

    try {
      for (const providerType of this.config.enabledProviders) {
        try {
          const provider = await this.getProviderInstance(providerType);
          const isAvailable = await provider.isAvailable();

          if (isAvailable) {
            console.log(`✅ [ProviderManager] ${providerType} is available`);
          } else {
            console.log(`⚠️ [ProviderManager] ${providerType} is not available (missing API key)`);
          }
        } catch (error) {
          console.error(
            `❌ [ProviderManager] Failed to initialize ${providerType}:`,
            error
          );
        }
      }

      console.log(
        `[ProviderManager] Initialization complete. Active provider: ${this.activeProvider}`
      );
    } catch (error) {
      console.error('[ProviderManager] Initialization error:', error);
      throw error;
    }
  }

  /**
   * ============================================
   * CORE REQUEST HANDLING
   * ============================================
   */

  /**
   * Send request to active provider
   * Main method - handles retries, caching, fallback
   * 
   * @param request - The request to send
   * @returns Response from provider
   * 
   * @example
   * const response = await providerManager.sendRequest({
   *   question: "Why is this error happening?",
   *   codeContext: "const x: number = 'string';",
   *   errorMessage: "Type 'string' is not assignable to type 'number'",
   *   filePath: "src/app.ts",
   *   errorType: "type"
   * });
   * 
   * Flow:
   * 1. Check cache for identical request
   * 2. If cached and fresh, return cached response
   * 3. Try active provider
   * 4. If fails and fallback enabled, try next provider
   * 5. If all fail, throw error
   * 6. Cache successful response
   */
  async sendRequest(request: AIProviderRequest): Promise<AIProviderResponse> {
    console.log('[ProviderManager] Sending request to', this.activeProvider);

    try {
      // Step 1: Check cache
      const cacheKey = this.generateCacheKey(request);
      const cachedResponse = this.getFromCache(cacheKey);

      if (cachedResponse) {
        console.log('[ProviderManager] ⚡ Using cached response');
        return cachedResponse;
      }

      // Step 2: Try active provider with retries
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
        try {
          console.log(`[ProviderManager] Attempt ${attempt}/${this.config.maxRetries}`);

          const provider = await this.getProviderInstance(this.activeProvider);

          if (!(await provider.isAvailable())) {
            throw new AIProviderError(
              this.activeProvider,
              'Provider not available (missing API key?)'
            );
          }

          // Send request with timeout
          const response = await this.withTimeout(
            provider.sendRequest(request),
            this.config.requestTimeout
          );

          // Step 3: Cache successful response
          this.addToCache(cacheKey, response);

          console.log('[ProviderManager] ✅ Request successful');
          return response;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.error(`[ProviderManager] Attempt ${attempt} failed:`, lastError.message);

          // Wait before retry (exponential backoff)
          if (attempt < this.config.maxRetries) {
            const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1);
            console.log(`[ProviderManager] Retrying in ${delay}ms...`);
            await this.delay(delay);
          }
        }
      }

      // Step 4: If active provider exhausted retries, try fallback
      if (this.config.enableFallback) {
        console.log('[ProviderManager] Active provider failed, trying fallback...');
        return await this.sendRequestWithFallback(request, this.activeProvider);
      }

      // All attempts failed
      throw lastError || new Error('Request failed');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ProviderManager] Request failed:', errorMessage);
      throw error;
    }
  }

  /**
   * Send request with streaming response
   * Streams response chunks as they arrive
   * 
   * @param request - The request
   * @param onChunk - Callback for each chunk
   * @returns Complete response
   * 
   * @example
   * await providerManager.sendRequestStream(request, (chunk) => {
   *   console.log('Received:', chunk);
   *   updateUIWithChunk(chunk);
   * });
   */
  async sendRequestStream(
    request: AIProviderRequest,
    onChunk: (chunk: string) => void
  ): Promise<AIProviderResponse> {
    console.log('[ProviderManager] Sending streaming request');

    try {
      const provider = await this.getProviderInstance(this.activeProvider);

      if (!(await provider.isAvailable())) {
        throw new AIProviderError(
          this.activeProvider,
          'Provider not available'
        );
      }

      const response = await this.withTimeout(
        provider.sendRequestStream(request, onChunk),
        this.config.requestTimeout
      );

      return response;
    } catch (error) {
      console.error('[ProviderManager] Streaming request failed:', error);
      throw error;
    }
  }

  /**
   * ============================================
   * PROVIDER MANAGEMENT
   * ============================================
   */

  /**
   * Get or create provider instance
   * Lazy loading - creates provider only when first needed
   * 
   * @param providerType - Which provider to get
   * @returns Provider instance
   * 
   * How it works:
   * 1. Check if instance already created
   * 2. If yes, return existing instance
   * 3. If no, create new instance
   * 4. Store for reuse
   */
  private async getProviderInstance(
    providerType: AIProviderType
  ): Promise<IAIProvider> {
    // Return existing instance if available
    if (this.providers.has(providerType)) {
      return this.providers.get(providerType)!;
    }

    // Create new instance
    let provider: IAIProvider;

    switch (providerType) {
      case AIProviderType.GEMINI:
        provider = new GeminiProvider();
        break;

      case AIProviderType.CLAUDE:
        provider = new ClaudeProvider();
        break;

      case AIProviderType.OPENAI:
        provider = new OpenAIProvider();
        break;

      case AIProviderType.COPILOT:
        provider = new CopilotProvider();
        break;

      case AIProviderType.VSCODE_LM:
        // For now, treat same as Copilot
        provider = new CopilotProvider();
        break;

      default:
        throw new Error(`Unknown provider: ${providerType}`);
    }

    // Store for reuse
    this.providers.set(providerType, provider);
    console.log(`[ProviderManager] Created ${providerType} provider instance`);

    return provider;
  }

  /**
   * Switch to different provider
   * 
   * @param providerType - New provider to use
   * 
   * @example
   * await providerManager.switchProvider(AIProviderType.CLAUDE);
   */
  async switchProvider(providerType: AIProviderType): Promise<void> {
    console.log(`[ProviderManager] Switching from ${this.activeProvider} to ${providerType}`);

    try {
      const provider = await this.getProviderInstance(providerType);
      const isAvailable = await provider.isAvailable();

      if (!isAvailable) {
        throw new Error(
          `Provider ${providerType} is not available (check API key configuration)`
        );
      }

      this.activeProvider = providerType;
      console.log(`[ProviderManager] ✅ Switched to ${providerType}`);
    } catch (error) {
      console.error('[ProviderManager] Failed to switch provider:', error);
      throw error;
    }
  }

  /**
   * Get currently active provider
   * 
   * @returns Active provider type
   */
  getActiveProvider(): AIProviderType {
    return this.activeProvider;
  }

  /**
   * Get list of available providers
   * (providers with API keys configured)
   * 
   * @returns List of available provider types
   * 
   * @example
   * const available = await providerManager.getAvailableProviders();
   * // Returns: ['gemini', 'claude']
   */
  async getAvailableProviders(): Promise<AIProviderType[]> {
    const available: AIProviderType[] = [];

    for (const providerType of this.config.enabledProviders) {
      try {
        const provider = await this.getProviderInstance(providerType);
        if (await provider.isAvailable()) {
          available.push(providerType);
        }
      } catch (error) {
        console.log(`[ProviderManager] ${providerType} not available:`, error);
      }
    }

    return available;
  }

  /**
   * Get provider capabilities
   * 
   * @param providerType - Which provider
   * @returns Provider capabilities
   */
  async getProviderCapabilities(providerType: AIProviderType) {
    const provider = await this.getProviderInstance(providerType);
    return provider.getCapabilities();
  }

  /**
   * ============================================
   * FALLBACK LOGIC
   * ============================================
   */

  /**
   * Send request with fallback to other providers
   * If active provider fails, tries others in order
   * 
   * @param request - The request
   * @param excludeProvider - Don't retry this provider
   * @returns Response from first successful provider
   * 
   * Flow:
   * 1. Get list of available providers
   * 2. Remove the failed provider from list
   * 3. Try each remaining provider
   * 4. Return response from first successful one
   */
  private async sendRequestWithFallback(
    request: AIProviderRequest,
    excludeProvider: AIProviderType
  ): Promise<AIProviderResponse> {
    console.log('[ProviderManager] Attempting fallback to alternative providers');

    const availableProviders = await this.getAvailableProviders();
    const fallbackProviders = availableProviders.filter(
      (p) => p !== excludeProvider
    );

    if (fallbackProviders.length === 0) {
      throw new Error('No fallback providers available');
    }

    for (const fallbackProvider of fallbackProviders) {
      try {
        console.log(`[ProviderManager] Trying fallback provider: ${fallbackProvider}`);

        const provider = await this.getProviderInstance(fallbackProvider);

        const response = await this.withTimeout(
          provider.sendRequest(request),
          this.config.requestTimeout
        );

        console.log(`[ProviderManager] ✅ Fallback successful with ${fallbackProvider}`);
        this.activeProvider = fallbackProvider; // Update active provider
        return response;
      } catch (error) {
        console.error(
          `[ProviderManager] Fallback to ${fallbackProvider} failed:`,
          error
        );
        continue; // Try next provider
      }
    }

    throw new Error('All fallback providers failed');
  }

  /**
   * ============================================
   * CACHING
   * ============================================
   */

  /**
   * Generate cache key from request
   * Creates unique key for request
   * 
   * @param request - Request to hash
   * @returns Cache key
   */
  private generateCacheKey(request: AIProviderRequest): string {
    // Simple hash: concatenate key fields
    const key = `${request.question}|${request.errorType}|${request.errorMessage}`;
    return this.simpleHash(key);
  }

  /**
   * Get cached response if still fresh
   * 
   * @param key - Cache key
   * @returns Cached response or null
   */
  private getFromCache(key: string): AIProviderResponse | null {
    const cached = this.responseCache.get(key);

    if (!cached) {
      return null;
    }

    // Check if cache is still fresh
    const age = Date.now() - cached.timestamp.getTime();
    if (age > this.CACHE_TTL) {
      console.log('[ProviderManager] Cache expired, removing');
      this.responseCache.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * Add response to cache
   * 
   * @param key - Cache key
   * @param response - Response to cache
   */
  private addToCache(key: string, response: AIProviderResponse): void {
    this.responseCache.set(key, response);
    console.log('[ProviderManager] Response cached');
  }

  /**
   * Clear all cached responses
   * 
   * @example
   * providerManager.clearCache();
   */
  clearCache(): void {
    this.responseCache.clear();
    console.log('[ProviderManager] Cache cleared');
  }

  /**
   * ============================================
   * UTILITY METHODS
   * ============================================
   */

  /**
   * Simple hash function for cache keys
   * 
   * @param str - String to hash
   * @returns Hash code
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Delay execution for specified time
   * 
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute promise with timeout
   * 
   * @param promise - Promise to execute
   * @param timeoutMs - Timeout in milliseconds
   * @returns Promise that rejects if timeout exceeded
   */
  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Request timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * Get manager status
   * Useful for debugging
   * 
   * @returns Status object
   */
  async getStatus() {
    const availableProviders = await this.getAvailableProviders();

    return {
      activeProvider: this.activeProvider,
      availableProviders,
      cacheSize: this.responseCache.size,
      queuedRequests: this.requestQueue.length,
      config: this.config,
    };
  }

  /**
   * Cleanup and shutdown
   * Called when extension deactivates
   */
  async dispose(): Promise<void> {
    console.log('[ProviderManager] Disposing...');
    this.providers.clear();
    this.responseCache.clear();
    this.requestQueue = [];
  }
}

/**
 * ============================================
 * SINGLETON INSTANCE
 * ============================================
 */
let providerManagerInstance: ProviderManager | null = null;

/**
 * Initialize provider manager
 * Called once when extension activates
 * 
 * @param config - Optional configuration
 * @returns Provider manager instance
 * 
 * @example
 * const providerManager = initProviderManager();
 * await providerManager.initialize();
 */
export function initProviderManager(
  config?: Partial<ProviderManagerConfig>
): ProviderManager {
  if (!providerManagerInstance) {
    providerManagerInstance = new ProviderManager(config);
  }
  return providerManagerInstance;
}

/**
 * Get provider manager instance
 * 
 * @returns Current instance
 * @throws Error if not initialized
 */
export function getProviderManager(): ProviderManager {
  if (!providerManagerInstance) {
    throw new Error(
      'ProviderManager not initialized. Call initProviderManager first.'
    );
  }
  return providerManagerInstance;
}

/**
 * Export for convenience
 */
export { ProviderManager };
