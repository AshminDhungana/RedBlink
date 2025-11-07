// browser-extension/src/background/index.ts

interface ChromeMessage {
  type: string
  data?: any
}

interface MessageSender extends chrome.runtime.MessageSender {
  tab?: chrome.tabs.Tab
}

type MessageResponse = (response: any) => void

// Simple error categorization (browser version)
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
  relatedError: string
  difficulty: string
}

console.log('🚀 RedBlink background script loaded')

// Store detected errors
const detectedErrors: Map<string, DetectedError[]> = new Map()
let errorCounter = 0
let questionCounter = 0

/**
 * Categorize error based on message
 */
function categorizeError(message: string): string {
  if (message.match(/Cannot find name|Type .* is not assignable/i)) {
    return 'Type Error'
  }
  if (message.match(/Expected|Unexpected token|syntax/i)) {
    return 'Syntax Error'
  }
  if (message.match(/Cannot find module|Module not found|Cannot resolve/i)) {
    return 'Import Error'
  }
  if (message.match(/Cannot read|undefined is not|null is not/i)) {
    return 'Runtime Error'
  }
  return 'Unknown Error'
}

/**
 * Generate questions for an error
 */
function generateQuestions(error: DetectedError): Question[] {
  const questions: Question[] = []

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
  }

  const category = error.category || 'Unknown Error'
  const questionTemplates = templates[category] || templates['Unknown Error']

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
    })
  })

  return questions
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
  }

  console.log('🚨 ERROR DETECTED:', error)

  // Store error
  const key = error.filename
  if (!detectedErrors.has(key)) {
    detectedErrors.set(key, [])
  }
  detectedErrors.get(key)!.push(error)

  // Generate questions
  const questions = generateQuestions(error)
  console.log(`❓ GENERATED ${questions.length} QUESTIONS:`)
  questions.forEach((q, i) => {
    console.log(`  ${i + 1}. ${q.text}`)
  })

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
        )
      }
    })
  })
}

// Listen for error messages from content script
chrome.runtime.onMessage.addListener(
  (request: ChromeMessage, sender: MessageSender, sendResponse: MessageResponse) => {
    console.log('📨 Message received:', request.type)

    if (request.type === 'ERROR_DETECTED') {
      processError(request.data)
    }

    if (request.type === 'PROMISE_REJECTION') {
      processError({
        message: `Promise Rejection: ${request.data}`,
        filename: 'unknown',
        lineno: 0,
        colno: 0,
      })
    }

    sendResponse({ status: 'processed' })
    return true
  }
)

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('✅ Tab loaded:', tab.url)
  }
})

console.log('✅ RedBlink background script initialized')
