
interface Question {
  id: string
  text: string
  category: string
  difficulty: string
}

interface ErrorNotification {
  error: any
  questions: Question[]
}

console.log('🚀 RedBlink content script injected')

/**
 * Display error and questions in the page
 */
function displayErrorAndQuestions(data: ErrorNotification): void {
  const { error, questions } = data

  console.log('❓ Displaying questions for error:', error)

  // Create notification element
  const notification = document.createElement('div')
  notification.id = 'redblink-notification'
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    max-width: 400px;
    background: #fff;
    border: 2px solid #ff4444;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  `

  // Header
  const header = document.createElement('div')
  header.style.cssText = `
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 12px;
    color: #ff4444;
  `
  header.textContent = `🔴 RedBlink Error: ${error.category}`
  notification.appendChild(header)

  // Error message
  const errorMsg = document.createElement('div')
  errorMsg.style.cssText = `
    font-size: 13px;
    color: #333;
    margin-bottom: 12px;
    padding: 8px;
    background: #f5f5f5;
    border-radius: 4px;
    border-left: 3px solid #ff4444;
  `
  errorMsg.textContent = error.message
  notification.appendChild(errorMsg)

  // Questions
  const questionsLabel = document.createElement('div')
  questionsLabel.style.cssText = `
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 8px;
    color: #333;
  `
  questionsLabel.textContent = '❓ Questions to Debug:'
  notification.appendChild(questionsLabel)

  // Question list
  const questionsList = document.createElement('ol')
  questionsList.style.cssText = `
    margin: 8px 0 0 0;
    padding-left: 20px;
    font-size: 12px;
    color: #555;
  `

  questions.forEach((q) => {
    const li = document.createElement('li')
    li.style.cssText = `
      margin-bottom: 6px;
      cursor: pointer;
      padding: 4px;
      border-radius: 3px;
      transition: background 0.2s;
    `
    li.textContent = q.text
    li.onmouseover = () => {
      li.style.background = '#f0f0f0'
    }
    li.onmouseout = () => {
      li.style.background = 'transparent'
    }
    li.onclick = () => {
      // Log question click (later: send to AI)
      console.log('Question clicked:', q)
      alert(`Thinking about: ${q.text}\n\n(AI integration coming soon!)`)
    }
    questionsList.appendChild(li)
  })
  notification.appendChild(questionsList)

  // Close button
  const closeBtn = document.createElement('button')
  closeBtn.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  `
  closeBtn.textContent = '✕'
  closeBtn.onclick = () => {
    notification.remove()
  }
  notification.appendChild(closeBtn)

  // Add to page
  document.body.appendChild(notification)

  // Auto-close after 15 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove()
    }
  }, 15000)
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
  console.log('📨 Content script received:', request.type)

  if (request.type === 'SHOW_QUESTIONS') {
    displayErrorAndQuestions({
      error: request.error,
      questions: request.questions,
    })
  }
})

// Listen for errors on the page
window.addEventListener('error', (event: ErrorEvent) => {
  console.error('🚨 Error detected on page:', event.message)

  // Send to background script
  chrome.runtime.sendMessage({
    type: 'ERROR_DETECTED',
    data: {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    },
  })
})

// Listen for unhandled promise rejections
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  console.error('⚠️ Unhandled rejection detected:', event.reason)

  chrome.runtime.sendMessage({
    type: 'PROMISE_REJECTION',
    data: String(event.reason),
  })
})

console.log('✅ RedBlink content script initialized')
