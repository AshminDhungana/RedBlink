

import * as providerManager from './providerManager';
import * as credentialManager from './credentialManager';
import { AIProviderType, AIProviderRequest } from '../shared/types';

/**
 * ============================================
 * REDBLINK BACKGROUND SERVICE WORKER
 * ============================================
 * 
 * Handles:
 * - Error detection & questions (code errors)
 * - General web assistance (YouTube, Twitter, etc.)
 * - AI provider requests
 * - Credential management
 * - Message routing
 */

// ===== TYPE DEFINITIONS =====

interface ChromeMessage {
  type: string;
  data?: any;
  provider?: AIProviderType;
  apiKey?: string;
  question?: string;
  error?: any;
  pageContext?: any;
  suggestions?: any[];
}

interface MessageSender extends chrome.runtime.MessageSender {
  tab?: chrome.tabs.Tab;
}

type MessageResponse = (response: any) => void;

interface DetectedError {
  id: string;
  type: string;
  message: string;
  filename: string;
  lineno: number;
  colno: number;
  category?: string;
  timestamp: number;
}

interface Question {
  id: string;
  text: string;
  category: string;
  relatedError: string;
  difficulty: string;
}

interface Suggestion {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  questions: string[];
}

// ===== STORAGE =====

const detectedErrors: Map<string, DetectedError[]> = new Map();
let errorCounter = 0;
let questionCounter = 0;

// Store page context for suggestions
let currentPageContext: any = null;
let currentSuggestions: Suggestion[] = [];

console.log('🚀 RedBlink background script loaded');

// ===== ERROR CATEGORIZATION & QUESTIONS =====

/**
 * Categorize error based on message
 */
function categorizeError(message: string): string {
  if (message.match(/Cannot find name|Type .* is not assignable/i)) {
    return 'Type Error';
  }
  if (message.match(/Expected|Unexpected token|syntax/i)) {
    return 'Syntax Error';
  }
  if (message.match(/Cannot find module|Module not found|Cannot resolve/i)) {
    return 'Import Error';
  }
  if (message.match(/Cannot read|undefined is not|null is not/i)) {
    return 'Runtime Error';
  }
  return 'Unknown Error';
}

/**
 * Generate questions for an error
 */
function generateQuestions(error: DetectedError): Question[] {
  const questions: Question[] = [];

  const templates: { [key: string]: string[] } = {
    'Type Error': [
      'What type is being assigned to this variable?',
      'Why is this type incompatible with the expected type?',
      'Have you checked what type is being inferred here?',
    ],
    'Syntax Error': [
      'What syntax element is missing?',
      'Can you spot where the syntax violation occurs?',
      'What bracket, semicolon, or keyword is missing?',
    ],
    'Import Error': [
      'Does the file path in this import actually exist?',
      'Is the export name spelled correctly?',
      'Did you export the item you are trying to import?',
    ],
    'Runtime Error': [
      'What value is undefined or null at this point?',
      'Did you initialize this variable before using it?',
      'What step in the execution path causes this error?',
    ],
    'Unknown Error': [
      'What does this error message tell you?',
      'Have you encountered this error type before?',
      'What code change triggered this error?',
    ],
  };

  const category = error.category || 'Unknown Error';
  const questionTemplates = templates[category] || templates['Unknown Error'];

  questionTemplates.forEach((template) => {
    questions.push({
      id: `question-${questionCounter++}`,
      text: template,
      category: category,
      relatedError: error.id,
      difficulty: category.includes('Syntax')
        ? 'beginner'
        : category.includes('Type')
          ? 'intermediate'
          : 'advanced',
    });
  });

  return questions;
}

/**
 * Process detected error
 */
function processError(errorData: any): void {
  const error: DetectedError = {
    id: `error-${errorCounter++}`,
    type: 'runtime',
    message: errorData.message,
    filename: errorData.filename || 'unknown',
    lineno: errorData.lineno || 0,
    colno: errorData.colno || 0,
    category: categorizeError(errorData.message),
    timestamp: Date.now(),
  };

  console.log('🚨 ERROR DETECTED:', error);

  // Store error
  const key = error.filename;
  if (!detectedErrors.has(key)) {
    detectedErrors.set(key, []);
  }
  detectedErrors.get(key)!.push(error);

  // Generate questions
  const questions = generateQuestions(error);
  console.log(`❓ GENERATED ${questions.length} QUESTIONS:`);
  questions.forEach((q, i) => {
    console.log(`  ${i + 1}. ${q.text}`);
  });

  // Broadcast to all tabs/content scripts
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id) {
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: 'SHOW_QUESTIONS',
            error: error,
            questions: questions,
          },
          () => {
            // Ignore errors if tab doesn't have content script
          }
        );
      }
    });
  });
}

// ===== MESSAGE HANDLING =====

/**
 * Main message listener
 */
chrome.runtime.onMessage.addListener(
  (request: ChromeMessage, sender: MessageSender, sendResponse: MessageResponse) => {
    console.log('📨 Message received:', request.type);

    switch (request.type) {
      // ===== ERROR HANDLING =====

      case 'ERROR_DETECTED':
        processError(request.data);
        sendResponse({ status: 'processed' });
        break;

      case 'PROMISE_REJECTION':
        processError({
          message: `Promise Rejection: ${request.data}`,
          filename: 'unknown',
          lineno: 0,
          colno: 0,
        });
        sendResponse({ status: 'processed' });
        break;

      // ===== AI PROVIDER MESSAGES =====

      case 'ASK_AI':
        handleAskAI(request.data, sendResponse);
        return true; // Async response

      case 'SET_API_KEY':
        handleSetApiKey(request.provider, request.apiKey, sendResponse);
        return true; // Async response

      case 'GET_STATUS':
        handleGetStatus(sendResponse);
        return true; // Async response

      case 'SET_ACTIVE_PROVIDER':
        handleSetActiveProvider(request.provider, sendResponse);
        return true; // Async response

      case 'GET_ERRORS':
        const allErrors = Array.from(detectedErrors.values()).flat();
        sendResponse({ errors: allErrors });
        break;

      // ===== GENERAL WEB ASSISTANCE =====

      case 'PAGE_ANALYZED':
        handlePageAnalyzed(request.pageContext, request.suggestions, sendResponse);
        return true;

      case 'ASK_SUGGESTION':
        handleAskSuggestion(request.question, sendResponse);
        return true; // Async response

      case 'GET_PAGE_CONTEXT':
        sendResponse({
          pageContext: currentPageContext,
          suggestions: currentSuggestions,
        });
        break;

      default:
        console.log('⚠️ Unknown message type:', request.type);
        sendResponse({ error: 'Unknown message type' });
    }
  }
);

// ===== ERROR HANDLING FUNCTIONS =====

/**
 * Handle AI request for errors
 */
async function handleAskAI(data: any, sendResponse: MessageResponse): Promise<void> {
  try {
    console.log('[Background] Asking AI about error...');

    const activeProvider = await providerManager.getActiveProvider();
    console.log(`[Background] Using provider: ${activeProvider}`);

    // Check if API key is configured
    const hasKey = await credentialManager.hasApiKey(activeProvider);
    if (!hasKey) {
      sendResponse({
        success: false,
        error: `No API key configured for ${activeProvider}. Please add it in settings.`,
      });
      return;
    }

    // Build request
    const aiRequest: AIProviderRequest = {
      question: data.question || 'What is this error?',
      codeContext: data.codeContext || data.error?.message || '',
      errorMessage: data.error?.message || '',
      filePath: data.error?.filename || 'unknown',
      errorType: data.error?.category || 'unknown',
      maxTokens: 1000,
    };

    // Send to provider
    const response = await providerManager.sendToProvider(aiRequest);

    console.log('[Background] ✅ AI response:', response);

    sendResponse({
      success: response.success,
      data: response,
      error: response.error,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Background] AI request error:', msg);
    sendResponse({
      success: false,
      error: msg,
    });
  }
}

/**
 * Handle API key configuration
 */
async function handleSetApiKey(
  provider: AIProviderType,
  apiKey: string,
  sendResponse: MessageResponse
): Promise<void> {
  try {
    if (!provider || !apiKey) {
      sendResponse({ success: false, error: 'Provider and API key required' });
      return;
    }

    await credentialManager.saveApiKey(provider, apiKey);
    console.log(`[Background] ✅ API key set for ${provider}`);
    sendResponse({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Background] Error setting API key:', msg);
    sendResponse({ success: false, error: msg });
  }
}

/**
 * Handle status request
 */
async function handleGetStatus(sendResponse: MessageResponse): Promise<void> {
  try {
    const activeProvider = await providerManager.getActiveProvider();
    const availableProviders = await providerManager.getAvailableProviders();

    sendResponse({
      activeProvider,
      availableProviders,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Background] Error getting status:', msg);
    sendResponse({ error: msg });
  }
}

/**
 * Handle provider switching
 */
async function handleSetActiveProvider(
  provider: AIProviderType,
  sendResponse: MessageResponse
): Promise<void> {
  try {
    await providerManager.setActiveProvider(provider);
    console.log(`[Background] ✅ Switched to ${provider}`);
    sendResponse({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Background] Error setting provider:', msg);
    sendResponse({ success: false, error: msg });
  }
}

// ===== GENERAL WEB ASSISTANCE FUNCTIONS =====

/**
 * Handle page analysis
 */
async function handlePageAnalyzed(
  pageContext: any,
  suggestions: Suggestion[],
  sendResponse: MessageResponse
): Promise<void> {
  try {
    console.log('[Background] Page analyzed:', pageContext.pageType);
    console.log('[Background] Generated', suggestions.length, 'suggestions');

    // Store page context and suggestions
    currentPageContext = pageContext;
    currentSuggestions = suggestions;

    // Save to session storage
    await chrome.storage.session.set({
      'current-page-context': pageContext,
      'current-suggestions': suggestions,
    });

    sendResponse({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Background] Error handling page analysis:', msg);
    sendResponse({ success: false, error: msg });
  }
}

/**
 * Handle suggestion request (general web assistance)
 */
async function handleAskSuggestion(
  question: string,
  sendResponse: MessageResponse
): Promise<void> {
  try {
    console.log('[Background] Handling suggestion request:', question);

    const activeProvider = await providerManager.getActiveProvider();
    console.log(`[Background] Using provider: ${activeProvider}`);

    // Check if API key is configured
    const hasKey = await credentialManager.hasApiKey(activeProvider);
    if (!hasKey) {
      sendResponse({
        success: false,
        error: `No API key configured for ${activeProvider}. Please add it in settings.`,
      });
      return;
    }

    // Build request with page context
    const aiRequest: AIProviderRequest = {
      question: question,
      codeContext:
        currentPageContext?.content ||
        currentPageContext?.title ||
        'General web page',
      errorMessage: '',
      filePath: currentPageContext?.url || 'unknown',
      errorType: 'suggestion',
      maxTokens: 1500,
    };

    // Send to provider
    const response = await providerManager.sendToProvider(aiRequest);

    console.log('[Background] ✅ Suggestion response:', response);

    sendResponse({
      success: response.success,
      data: response,
      error: response.error,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Background] Suggestion request error:', msg);
    sendResponse({
      success: false,
      error: msg,
    });
  }
}

// ===== TAB LISTENERS =====

/**
 * Listen for tab updates
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('✅ Tab loaded:', tab.url);
    
    // Clear page context when navigating to new page
    if (changeInfo.url) {
      currentPageContext = null;
      currentSuggestions = [];
    }
  }
});

/**
 * Listen for tab removal
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log('🚫 Tab closed:', tabId);
  
  // Could clear errors for closed tabs here if needed
});

// ===== INITIALIZATION =====

/**
 * Initialize on load
 */
async function initialize() {
  console.log('[Background] Initializing...');
  
  try {
    // Initialize provider manager
    const activeProvider = await providerManager.getActiveProvider();
    console.log(`[Background] Active provider: ${activeProvider}`);

    // Check for configured providers
    const availableProviders = await providerManager.getAvailableProviders();
    console.log(
      `[Background] Available providers:`,
      availableProviders.length > 0 ? availableProviders.join(', ') : 'None'
    );

    console.log('[Background] ✅ Initialization complete');
  } catch (error) {
    console.error('[Background] Initialization error:', error);
  }
}

// Initialize on load
initialize();

console.log('✅ RedBlink background script fully initialized');
