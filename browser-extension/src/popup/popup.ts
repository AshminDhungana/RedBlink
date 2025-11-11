// browser-extension/src/popup/popup.ts

// Import error detection modules
import { ErrorDetector } from '../errorDetector/index'
import { QuestionGenerator } from '../questionGenerator/index'

interface DetectedError {
  id: string
  type: string
  message: string
  filename: string
  lineno: number
  colno: number
  category?: string
  timestamp: number
}

interface Question {
  id: string
  text: string
  category: string
  difficulty: string
}

interface ErrorLog {
  type: string
  timestamp: number
  message: string
}

const errorDetector = new ErrorDetector()
const questionGenerator = new QuestionGenerator()
const errorLogs: ErrorLog[] = []
let detectedErrors: (DetectedError & { questions: Question[] })[] = []

console.log('🚀 RedBlink popup loaded')

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Popup DOM loaded')

  const statusElement = document.getElementById('status')
  if (statusElement) {
    statusElement.textContent = '🟢 RedBlink Ready'
  }

  // Setup button listeners
  setupButtons()

  // Load initial errors
  loadErrors()
})

/**
 * Setup button event listeners
 */
function setupButtons() {
  const refreshBtn = document.getElementById('refreshBtn')
  const testBtn = document.getElementById('testBtn')

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      console.log('🔄 Refresh clicked')
      loadErrors()
    })
  }

  if (testBtn) {
    testBtn.addEventListener('click', () => {
      console.log('🧪 Test clicked')
      testError()
    })
  }
}

/**
 * Load errors from background script
 */
function loadErrors() {
  chrome.runtime.sendMessage({ type: 'GET_ERRORS' }, (response: any) => {
    if (response && response.errors) {
      console.log(`📊 Loaded ${response.errors.length} errors`)
      detectedErrors = response.errors
      updateUI()
    } else {
      console.log('✓ No errors currently detected')
      updateUI()
    }
  })
}

/**
 * Test with sample error
 */
function testError() {
  const testErrorData = {
    message: 'Error TS2322: Type "string" is not assignable to type "number"',
    filename: 'test.ts',
    lineno: 42,
    colno: 10,
  }

  const detected = errorDetector.detectFromText(testErrorData.message, testErrorData.filename)

  if (detected.length > 0) {
    const error = detected[0]
    const questions = questionGenerator.generate(error)

    detectedErrors = [
      {
        id: error.id,
        type: error.type,
        message: error.message,
        filename: testErrorData.filename,
        lineno: testErrorData.lineno,
        colno: testErrorData.colno,
        category: error.category,
        timestamp: Date.now(),
        questions: questions,
      },
    ]

    console.log(`✅ Test error created with ${questions.length} questions`)
    updateUI()
  }
}

/**
 * Update popup UI
 */
function updateUI() {
  const errorsList = document.getElementById('errorsList')
  const errorCount = document.getElementById('errorCount')

  if (!errorsList) {
    console.error('❌ errorsList element not found')
    return
  }

  // Update count
  if (errorCount) {
    errorCount.textContent = detectedErrors.length.toString()
  }

  // Clear list
  errorsList.innerHTML = ''

  // Show empty state
  if (detectedErrors.length === 0) {
    errorsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✓</div>
        <div class="empty-text">No errors detected</div>
      </div>
    `
    return
  }

  // Add error cards
  detectedErrors.forEach((error) => {
    const card = createErrorCard(error)
    errorsList.appendChild(card)
  })

  console.log(`📋 Updated UI with ${detectedErrors.length} error cards`)
}

/**
 * Create error card DOM element
 */
function createErrorCard(error: DetectedError & { questions: Question[] }): HTMLElement {
  const card = document.createElement('div')
  card.className = 'error-card'

  const questionsHtml = error.questions
    .map((q: Question) => {
      return `
      <div class="question">
        <div class="question-text">❓ ${q.text}</div>
        <div class="question-difficulty">${q.difficulty}</div>
      </div>
    `
    })
    .join('')

  card.innerHTML = `
    <div class="error-header">
      <span class="error-icon">❌</span>
      <span class="error-type">${error.category || 'Unknown'}</span>
      <span class="error-line">[Ln ${error.lineno}]</span>
    </div>
    <div class="error-message">${error.message}</div>
    <div class="error-file">${error.filename}</div>
    <div class="questions-container">
      ${questionsHtml}
    </div>
  `

  return card
}

// Listen for messages from background
chrome.runtime.onMessage.addListener(
  (
    request: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => {
    console.log('📨 Popup received message:', request.type)

    if (request.type === 'ERROR_DETECTED') {
      errorLogs.push({
        type: request.type,
        timestamp: Date.now(),
        message: request.data.message,
      })

      // Reload errors display
      loadErrors()
    }

    sendResponse({ received: true })
  }
)

console.log('✅ RedBlink popup fully initialized')


/**
 * Ask AI about an error (NEW)
 */
function askAI(errorId: string, errorData: any): void {
  console.log('🤖 Asking AI about error:', errorData);

  // Show loading state
  const errorCard = document.querySelector(`[data-error-id="${errorId}"]`);
  if (errorCard) {
    const responseDiv = errorCard.querySelector('.ai-response') || document.createElement('div');
    responseDiv.className = 'ai-response';
    responseDiv.innerHTML = '<div class="loading">⏳ Asking AI...</div>';
    errorCard.appendChild(responseDiv);
  }

  // Send to background
  chrome.runtime.sendMessage(
    {
      type: 'ASK_AI',
      data: {
        error: errorData,
        question: `What is this ${errorData.category} error and how do I fix it?`,
        codeContext: errorData.message,
      },
    },
    (response) => {
      if (response.success) {
        console.log('✅ AI Response:', response.data);
        displayAIResponse(errorId, response.data);
      } else {
        console.error('❌ AI Error:', response.error);
        showError('AI request failed: ' + response.error);
      }
    }
  );
}

/**
 * Display AI response in popup
 */
function displayAIResponse(errorId: string, response: any): void {
  const errorCard = document.querySelector(`[data-error-id="${errorId}"]`);
  if (!errorCard) return;

  const responseDiv = errorCard.querySelector('.ai-response') || document.createElement('div');
  responseDiv.className = 'ai-response';
  responseDiv.innerHTML = `
    <div class="ai-response-header">✅ ${response.provider}</div>
    <div class="ai-response-text">${escapeHtml(response.text)}</div>
    <div class="ai-response-meta">⏱️ ${response.responseTime}ms | 📊 ${response.tokenUsage.totalTokens} tokens</div>
  `;

  if (!errorCard.querySelector('.ai-response')) {
    errorCard.appendChild(responseDiv);
  }
}

/**
 * Configure API key (NEW)
 */
function configureApiKey(): void {
  const provider = prompt('Enter provider (gemini, claude, openai):');
  if (!provider) return;

  const apiKey = prompt(`Enter ${provider} API key:`);
  if (!apiKey) return;

  chrome.runtime.sendMessage(
    {
      type: 'SET_API_KEY',
      provider: provider.toLowerCase(),
      apiKey: apiKey,
    },
    (response) => {
      if (response.success) {
        alert('✅ API key saved!');
        loadStatus();
      } else {
        alert('❌ Error: ' + response.error);
      }
    }
  );
}

/**
 * Load provider status (NEW)
 */
function loadStatus(): void {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response.activeProvider) {
      // Update status display
      const statusDiv = document.getElementById('status');
      if (statusDiv) {
        statusDiv.innerHTML = `
          <div style="font-size: 12px; color: #888;">
            🤖 Provider: <strong>${response.activeProvider}</strong><br>
            ✅ Available: ${response.availableProviders?.join(', ') || 'None'}
            <button onclick="configureApiKey()" style="margin-top: 6px; width: 100%; padding: 4px; font-size: 11px;">
              ⚙️ Add API Key
            </button>
          </div>
        `;
      }
    }
  });
}

/**
 * Show error message (NEW)
 */
function showError(message: string): void {
  alert('❌ ' + message);
}

/**
 * Escape HTML (NEW)
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Load status when popup opens (NEW)
document.addEventListener('DOMContentLoaded', () => {
  // ... keep your existing code ...
  
  // ADD THIS:
  loadStatus();
});
