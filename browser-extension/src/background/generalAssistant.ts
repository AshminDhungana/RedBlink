// browser-extension/src/background/generalAssistant.ts

/**
 * ============================================
 * GENERAL ASSISTANT - FOR WEB CONTENT
 * ============================================
 * 
 * Handles non-error suggestions and assistance
 * Works on YouTube, Twitter, Reddit, etc.
 */

import { AIProviderRequest, AIProviderResponse } from '../shared/types';
import * as providerManager from './providerManager';

/**
 * Generate AI response for web content
 */
export async function generateSuggestion(
  question: string,
  pageContext: any
): Promise<AIProviderResponse> {
  console.log('[GeneralAssistant] Generating suggestion for:', question);

  try {
    // Build request
    const request: AIProviderRequest = {
      question: question,
      codeContext: pageContext.content || '',
      errorMessage: '',
      filePath: pageContext.url,
      errorType: 'suggestion',
      maxTokens: 1500,
    };

    // Send to AI provider
    const response = await providerManager.sendToProvider(request);

    if (!response.success) {
      throw new Error(`AI request failed: ${response.error}`);
    }

    console.log('[GeneralAssistant] ✅ Suggestion generated');
    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[GeneralAssistant] Error:', errorMessage);

    return {
      id: 'suggestion_error',
      text: '',
      provider: 'unknown' as any,
      responseTime: 0,
      timestamp: new Date(),
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      success: false,
      error: errorMessage,
    };
  }
}
