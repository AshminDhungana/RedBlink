// browser-extension/src/content/generalContent.ts

/**
 * General content handler for web pages
 * Detects context and offers suggestions
 */

import { analyzePageContent, generateSuggestions } from '../contentAnalyzer';

console.log('🎯 RedBlink general content assistant loaded');

/**
 * Detect page type and show suggestions
 */
function detectAndShowSuggestions(): void {
  try {
    // Analyze page content
    const pageContext = analyzePageContent();
    console.log('[GeneralContent] Page context:', pageContext);

    // Generate suggestions based on page type
    const suggestions = generateSuggestions(pageContext);
    console.log('[GeneralContent] Generated suggestions:', suggestions);

    // Send to background
    chrome.runtime.sendMessage(
      {
        type: 'PAGE_ANALYZED',
        pageContext: pageContext,
        suggestions: suggestions,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('[GeneralContent] Error:', chrome.runtime.lastError);
          return;
        }
        console.log('[GeneralContent] Suggestions sent to background');
      }
    );
  } catch (error) {
    console.error('[GeneralContent] Error detecting page:', error);
  }
}

// Detect on load
window.addEventListener('load', () => {
  setTimeout(() => {
    detectAndShowSuggestions();
  }, 1000); // Wait for page to fully load
});

// Listen for messages from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[GeneralContent] Received:', request.type);

  if (request.type === 'SHOW_SUGGESTION') {
    displaySuggestion(request.suggestion);
    sendResponse({ received: true });
  }
});

/**
 * Display suggestion notification
 */
function displaySuggestion(suggestion: any): void {
  const notif = document.createElement('div');
  notif.id = 'redblink-suggestion';
  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    max-width: 400px;
    background: #fff;
    border: 2px solid #0066cc;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
  `;

  notif.innerHTML = `
    <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #0066cc;">
      ${suggestion.icon} ${suggestion.title}
    </div>
    <div style="font-size: 12px; color: #555; margin-bottom: 12px;">
      ${suggestion.description}
    </div>
    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
      ${suggestion.questions
        .slice(0, 3)
        .map(
          (q: string, i: number) => `
        <button onclick="askSuggestion('${q.replace(/'/g, "\\'")}', ${i})"
          style="flex: 1; min-width: 80px; padding: 6px; font-size: 11px;
            background: #0066cc; color: white; border: none; border-radius: 3px;
            cursor: pointer;">
          ❓ Ask
        </button>
      `
        )
        .join('')}
    </div>
    <button onclick="closeSuggestion()"
      style="position: absolute; top: 8px; right: 8px; background: none;
        border: none; font-size: 18px; cursor: pointer;">✕</button>
  `;

  document.body.appendChild(notif);

  // Auto-close
  setTimeout(() => {
    if (notif.parentNode) {
      notif.remove();
    }
  }, 10000);
}

// Global functions for UI
(window as any).askSuggestion = (question: string, index: number): void => {
  chrome.runtime.sendMessage({
    type: 'ASK_SUGGESTION',
    question: question,
    index: index,
  });

  // Remove notification
  const notif = document.getElementById('redblink-suggestion');
  if (notif) {
    notif.remove();
  }
};

(window as any).closeSuggestion = (): void => {
  const notif = document.getElementById('redblink-suggestion');
  if (notif) {
    notif.remove();
  }
};

console.log('✅ RedBlink general content assistant ready');
