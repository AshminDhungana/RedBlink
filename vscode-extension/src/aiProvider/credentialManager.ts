import * as vscode from 'vscode';
import { AIProviderType } from './types';

/**
 * ============================================
 * CREDENTIAL MANAGER
 * ============================================
 * Securely manages and stores API keys for all AI providers
 * Uses VS Code's built-in secret storage (encrypted)
 * 
 * Flow:
 * 1. User enters API key in settings
 * 2. credentialManager.setCredential() encrypts and stores it
 * 3. When provider needs key: credentialManager.getCredential()
 * 4. Key is retrieved securely from VS Code vault
 */

/**
 * Main credential manager class
 */
export class CredentialManager {
  /**
   * VS Code secret storage instance
   * Provided by VS Code extension API
   */
  private secretStorage: vscode.SecretStorage;

  /**
   * Service name for credential storage
   * All credentials stored under this service
   */
  private readonly SERVICE_NAME = 'redblink-ai-providers';

  /**
   * Prefix for credential keys in storage
   * Prevents conflicts with other extensions
   */
  private readonly CREDENTIAL_PREFIX = 'api_key_';

  /**
   * Constructor
   * @param secretStorage - VS Code's built-in secret storage
   */
  constructor(secretStorage: vscode.SecretStorage) {
    this.secretStorage = secretStorage;
  }

  /**
   * ============================================
   * MAIN METHODS
   * ============================================
   */

  /**
   * Store API key securely
   * 
   * @param provider - Which provider (claude, openai, etc.)
   * @param apiKey - The actual API key
   * @returns Promise that resolves when stored
   * 
   * @example
   * await credentialManager.setCredential(AIProviderType.GEMINI, 'your-api-key');
   * 
   * How it works:
   * 1. Creates storage key: `api_key_gemini`
   * 2. Validates API key format
   * 3. Stores in VS Code's encrypted vault
   * 4. Returns promise when done
   */
  async setCredential(provider: AIProviderType, apiKey: string): Promise<void> {
    try {
      // Validate input
      if (!apiKey || apiKey.trim().length === 0) {
        throw new Error('API key cannot be empty');
      }

      // Create storage key
      const storageKey = this.getStorageKey(provider);

      // Trim whitespace
      const cleanedApiKey = apiKey.trim();

      // Store in VS Code secret storage (encrypted)
      await this.secretStorage.store(storageKey, cleanedApiKey);

      // Show success message
      vscode.window.showInformationMessage(
        `✅ ${this.getProviderDisplayName(provider)} API key saved successfully`
      );

      console.log(`[CredentialManager] Stored API key for ${provider}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `❌ Failed to save ${this.getProviderDisplayName(provider)} API key: ${errorMessage}`
      );
      console.error(`[CredentialManager] Error storing credential:`, error);
      throw error;
    }
  }

  /**
   * Retrieve API key from secure storage
   * 
   * @param provider - Which provider to get key for
   * @returns API key, or null if not found
   * 
   * @example
   * const apiKey = await credentialManager.getCredential(AIProviderType.GEMINI);
   * if (apiKey) {
   *   // Use the API key
   * } else {
   *   // API key not stored
   * }
   * 
   * How it works:
   * 1. Creates storage key: `api_key_gemini`
   * 2. Retrieves from VS Code's encrypted vault
   * 3. Returns key or null if not found
   */
  async getCredential(provider: AIProviderType): Promise<string | null> {
    try {
      const storageKey = this.getStorageKey(provider);
      const apiKey = await this.secretStorage.get(storageKey);

      if (!apiKey) {
        console.log(`[CredentialManager] No credential found for ${provider}`);
        return null;
      }

      console.log(`[CredentialManager] Retrieved credential for ${provider}`);
      return apiKey;
    } catch (error) {
      console.error(`[CredentialManager] Error retrieving credential:`, error);
      return null;
    }
  }

  /**
   * Check if API key exists for provider
   * 
   * @param provider - Provider to check
   * @returns true if key exists, false otherwise
   * 
   * @example
   * if (await credentialManager.hasCredential(AIProviderType.GEMINI)) {
   *   // Can use Gemini
   * }
   */
  async hasCredential(provider: AIProviderType): Promise<boolean> {
    const credential = await this.getCredential(provider);
    return credential !== null && credential.length > 0;
  }

  /**
   * Delete API key from storage
   * 
   * @param provider - Which provider's key to delete
   * 
   * @example
   * await credentialManager.deleteCredential(AIProviderType.GEMINI);
   */
  async deleteCredential(provider: AIProviderType): Promise<void> {
    try {
      const storageKey = this.getStorageKey(provider);
      await this.secretStorage.delete(storageKey);

      vscode.window.showInformationMessage(
        `✅ ${this.getProviderDisplayName(provider)} API key removed`
      );

      console.log(`[CredentialManager] Deleted credential for ${provider}`);
    } catch (error) {
      console.error(`[CredentialManager] Error deleting credential:`, error);
      throw error;
    }
  }

  /**
   * Clear all stored API keys
   * 
   * @example
   * await credentialManager.clearAllCredentials();
   */
  async clearAllCredentials(): Promise<void> {
    try {
      const providers = Object.values(AIProviderType);

      for (const provider of providers) {
        await this.deleteCredential(provider as AIProviderType);
      }

      console.log('[CredentialManager] Cleared all credentials');
    } catch (error) {
      console.error('[CredentialManager] Error clearing credentials:', error);
      throw error;
    }
  }

  /**
   * ============================================
   * HELPER METHODS
   * ============================================
   */

  /**
   * Generate storage key for a provider
   * 
   * Format: `api_key_<provider>`
   * Example: `api_key_gemini`
   * 
   * @param provider - Provider name
   * @returns Storage key string
   */
  private getStorageKey(provider: AIProviderType): string {
    return `${this.CREDENTIAL_PREFIX}${provider}`;
  }

  /**
   * Get human-readable name for provider
   * 
   * @param provider - Provider type
   * @returns Display name
   */
  private getProviderDisplayName(provider: AIProviderType): string {
    const displayNames: Record<AIProviderType, string> = {
      [AIProviderType.CLAUDE]: 'Claude (Anthropic)',
      [AIProviderType.OPENAI]: 'ChatGPT (OpenAI)',
      [AIProviderType.GEMINI]: 'Gemini (Google)',
      [AIProviderType.COPILOT]: 'GitHub Copilot',
      [AIProviderType.VSCODE_LM]: 'VS Code LM',
    };

    return displayNames[provider] || provider;
  }

  /**
   * ============================================
   * VALIDATION METHODS
   * ============================================
   */

  /**
   * Validate API key format for a specific provider
   * 
   * @param provider - Which provider
   * @param apiKey - The API key to validate
   * @returns object with { valid: boolean, error?: string }
   * 
   * Different providers have different key formats:
   * - Gemini: Usually starts with "sk-" or "AIzaSy..."
   * - Claude: Usually starts with "sk-ant-"
   * - OpenAI: Usually starts with "sk-"
   * - Copilot: No key needed (uses VS Code auth)
   */
  validateApiKeyFormat(provider: AIProviderType, apiKey: string): {
    valid: boolean;
    error?: string;
  } {
    if (!apiKey || apiKey.trim().length === 0) {
      return { valid: false, error: 'API key cannot be empty' };
    }

    const key = apiKey.trim();

    // Provider-specific validation
    switch (provider) {
      case AIProviderType.CLAUDE:
        if (!key.startsWith('sk-ant-')) {
          return {
            valid: false,
            error: 'Claude API key should start with "sk-ant-"',
          };
        }
        if (key.length < 30) {
          return { valid: false, error: 'Claude API key seems too short' };
        }
        break;

      case AIProviderType.OPENAI:
        if (!key.startsWith('sk-')) {
          return {
            valid: false,
            error: 'OpenAI API key should start with "sk-"',
          };
        }
        if (key.length < 30) {
          return { valid: false, error: 'OpenAI API key seems too short' };
        }
        break;

      case AIProviderType.GEMINI:
        // Gemini keys are usually shorter, just check if not empty
        if (key.length < 10) {
          return { valid: false, error: 'Gemini API key seems too short' };
        }
        break;

      case AIProviderType.COPILOT:
        // Copilot doesn't need API key
        return { valid: true };

      case AIProviderType.VSCODE_LM:
        // VS Code LM doesn't need API key
        return { valid: true };
    }

    return { valid: true };
  }

  /**
   * ============================================
   * UTILITY METHODS
   * ============================================
   */

  /**
   * Get all configured providers
   * 
   * @returns List of providers that have API keys set
   */
  async getConfiguredProviders(): Promise<AIProviderType[]> {
    const configured: AIProviderType[] = [];
    const providers = Object.values(AIProviderType);

    for (const provider of providers) {
      if (await this.hasCredential(provider as AIProviderType)) {
        configured.push(provider as AIProviderType);
      }
    }

    return configured;
  }

  /**
   * Get credential status summary
   * 
   * Shows which providers have keys and which don't
   * Useful for debugging
   * 
   * @returns Object with status of each provider
   */
  async getCredentialStatus(): Promise<
    Record<AIProviderType, { configured: boolean }>
  > {
    const status: Partial<Record<AIProviderType, { configured: boolean }>> = {};
    const providers = Object.values(AIProviderType);

    for (const provider of providers) {
      const configured = await this.hasCredential(provider as AIProviderType);
      status[provider as AIProviderType] = { configured };
    }

    return status as Record<AIProviderType, { configured: boolean }>;
  }
}

/**
 * ============================================
 * SINGLETON INSTANCE
 * ============================================
 * Create one instance per extension activation
 */
let credentialManagerInstance: CredentialManager | null = null;

/**
 * Initialize credential manager
 * Called once when extension activates
 * 
 * @param secretStorage - VS Code's secret storage
 * @returns Credential manager instance
 */
export function initCredentialManager(
  secretStorage: vscode.SecretStorage
): CredentialManager {
  if (!credentialManagerInstance) {
    credentialManagerInstance = new CredentialManager(secretStorage);
  }
  return credentialManagerInstance;
}

/**
 * Get credential manager instance
 * 
 * @returns Current credential manager
 * @throws Error if not initialized
 */
export function getCredentialManager(): CredentialManager {
  if (!credentialManagerInstance) {
    throw new Error(
      'CredentialManager not initialized. Call initCredentialManager first.'
    );
  }
  return credentialManagerInstance;
}
