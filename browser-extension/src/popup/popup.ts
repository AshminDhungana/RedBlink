
interface ErrorLog {
  type: string
  timestamp: number
  message: string
}

const errorLogs: ErrorLog[] = []

console.log('RedBlink popup loaded')

document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup DOM loaded')
  
  const statusElement = document.getElementById('status')
  if (statusElement) {
    statusElement.textContent = 'RedBlink Ready'
  }
})

// Listen for messages from background
chrome.runtime.onMessage.addListener(
  (request: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) => {
    console.log('Popup received message:', request)
    
    if (request.type === 'ERROR_DETECTED') {
      errorLogs.push({
        type: request.type,
        timestamp: Date.now(),
        message: request.data.message,
      })
      updateUI()
    }
    
    sendResponse({ received: true })
  }
)

function updateUI() {
  console.log('Updating UI with', errorLogs.length, 'errors')
}
