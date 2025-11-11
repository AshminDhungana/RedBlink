

/**
 * ============================================
 * CREDENTIAL MANAGER - BROWSER VERSION
 * ============================================
 * 
 * Manages API keys using Chrome Storage API
 * Automatically encrypted by Chrome
 */

import { AIProviderType } from '../shared/types';

const STORAGE_PREFIX = 'redblink-api-key-';

/**
 * Save API key to Chrome storage
 */
export async function saveApiKey(
  provider: AIProviderType,
  apiKey: string
): Promise<void> {
  const key = `${STORAGE_PREFIX}${provider}`;
  
  try {
    await chrome.storage.sync.set({ [key]: apiKey });
    console.log(`✅ API key saved for ${provider}`);
  } catch (error) {
    console.error('Error saving API key:', error);
    throw error;
  }
}

/**
 * Get API key from Chrome storage
 */
export async function getApiKey(provider: AIProviderType): Promise<string | null> {
  const key = `${STORAGE_PREFIX}${provider}`;
  
  try {
    const result = await chrome.storage.sync.get(key);
    return result[key] || null;
  } catch (error) {
    console.error('Error getting API key:', error);
    return null;
  }
}

/**
 * Check if API key exists
 */
export async function hasApiKey(provider: AIProviderType): Promise<boolean> {
  const key = await getApiKey(provider);
  return key !== null && key.length > 0;
}

/**
 * Delete API key
 */
export async function deleteApiKey(provider: AIProviderType): Promise<void> {
  const key = `${STORAGE_PREFIX}${provider}`;
  
  try {
    await chrome.storage.sync.remove(key);
    console.log(`✅ API key deleted for ${provider}`);
  } catch (error) {
    console.error('Error deleting API key:', error);
    throw error;
  }
}

/**
 * Get all configured providers
 */
export async function getConfiguredProviders(): Promise<AIProviderType[]> {
  const configured: AIProviderType[] = [];
  const providers = Object.values(AIProviderType);
  
  for (const provider of providers) {
    if (await hasApiKey(provider as AIProviderType)) {
      configured.push(provider as AIProviderType);
    }
  }
  
  return configured;
}
