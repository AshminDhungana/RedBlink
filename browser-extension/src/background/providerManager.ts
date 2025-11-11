// browser-extension/src/background/providerManager.ts

/**
 * ============================================
 * PROVIDER MANAGER - BROWSER VERSION
 * ============================================
 * 
 * Manages AI providers for browser extension
 */

import * as credentialManager from './credentialManager';
import {
  AIProviderType,
  AIProviderRequest,
  AIProviderResponse,
} from '../shared/types';

// Use Anthropic SDK for Claude in browser
import Anthropic from '@anthropic-ai/sdk';

/**
 * Send request to AI provider
 */
export async function sendToProvider(
  request: AIProviderRequest
): Promise<AIProviderResponse> {
  const activeProvider = await getActiveProvider();
  
  console.log(`🤖 Sending to ${activeProvider}...`);

  switch (activeProvider) {
    case AIProviderType.GEMINI:
      return sendToGemini(request);
    case AIProviderType.CLAUDE:
      return sendToClaude(request);
    case AIProviderType.OPENAI:
      return sendToOpenAI(request);
    default:
      throw new Error(`Provider ${activeProvider} not supported in browser`);
  }
}

/**
 * Send to Gemini API
 */
async function sendToGemini(request: AIProviderRequest): Promise<AIProviderResponse> {
  const startTime = Date.now();

  try {
    const apiKey = await credentialManager.getApiKey(AIProviderType.GEMINI);
    
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + apiKey;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: buildPrompt(request),
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: request.maxTokens || 2000,
        temperature: request.temperature || 0.7,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Gemini API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    const responseTime = Date.now() - startTime;

    return {
      id: generateId(),
      text: text,
      provider: AIProviderType.GEMINI,
      responseTime,
      timestamp: new Date(),
      tokenUsage: {
        inputTokens: Math.ceil(buildPrompt(request).length / 4),
        outputTokens: Math.ceil(text.length / 4),
        totalTokens: Math.ceil((buildPrompt(request).length + text.length) / 4),
      },
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const responseTime = Date.now() - startTime;

    console.error('[Gemini] Error:', errorMessage);

    return {
      id: generateId(),
      text: '',
      provider: AIProviderType.GEMINI,
      responseTime,
      timestamp: new Date(),
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send to Claude API
 */
async function sendToClaude(request: AIProviderRequest): Promise<AIProviderResponse> {
  const startTime = Date.now();

  try {
    const apiKey = await credentialManager.getApiKey(AIProviderType.CLAUDE);
    
    if (!apiKey) {
      throw new Error('Claude API key not configured');
    }

    const client = new Anthropic({ apiKey: apiKey });

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: request.maxTokens || 2000,
      messages: [
        {
          role: 'user',
          content: buildPrompt(request),
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const responseTime = Date.now() - startTime;

    return {
      id: generateId(),
      text: text,
      provider: AIProviderType.CLAUDE,
      responseTime,
      timestamp: new Date(),
      tokenUsage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const responseTime = Date.now() - startTime;

    console.error('[Claude] Error:', errorMessage);

    return {
      id: generateId(),
      text: '',
      provider: AIProviderType.CLAUDE,
      responseTime,
      timestamp: new Date(),
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Send to OpenAI API
 */
async function sendToOpenAI(request: AIProviderRequest): Promise<AIProviderResponse> {
  const startTime = Date.now();

  try {
    const apiKey = await credentialManager.getApiKey(AIProviderType.OPENAI);
    
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: buildPrompt(request),
          },
        ],
        max_tokens: request.maxTokens || 2000,
        temperature: request.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    const responseTime = Date.now() - startTime;

    return {
      id: generateId(),
      text: text,
      provider: AIProviderType.OPENAI,
      responseTime,
      timestamp: new Date(),
      tokenUsage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const responseTime = Date.now() - startTime;

    console.error('[OpenAI] Error:', errorMessage);

    return {
      id: generateId(),
      text: '',
      provider: AIProviderType.OPENAI,
      responseTime,
      timestamp: new Date(),
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Build prompt from request
 */
function buildPrompt(request: AIProviderRequest): string {
  return `I have a ${request.errorType} error in my code.

File: ${request.filePath}

Error Message: ${request.errorMessage}

Code Context:
\`\`\`
${request.codeContext}
\`\`\`

Question: ${request.question}

Please help me understand and fix this error.`;
}

/**
 * Get active provider
 */
export async function getActiveProvider(): Promise<AIProviderType> {
  const stored = await chrome.storage.local.get('redblink-active-provider');
  return stored['redblink-active-provider'] || AIProviderType.GEMINI;
}

/**
 * Set active provider
 */
export async function setActiveProvider(provider: AIProviderType): Promise<void> {
  await chrome.storage.local.set({ 'redblink-active-provider': provider });
  console.log(`✅ Active provider set to ${provider}`);
}

/**
 * Get available providers (those with API keys)
 */
export async function getAvailableProviders(): Promise<AIProviderType[]> {
  return credentialManager.getConfiguredProviders();
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `response_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}
