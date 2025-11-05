interface ChromeMessage {
  type: string
  data?: any
}

interface MessageSender extends chrome.runtime.MessageSender {
  tab?: chrome.tabs.Tab
}

type MessageResponse = (response: any) => void

console.log('RedBlink background script loaded')

chrome.runtime.onMessage.addListener(
  (request: ChromeMessage, sender: MessageSender, sendResponse: MessageResponse) => {
    console.log('Message received:', request)
    console.log('From:', sender.url)
    
    sendResponse({ status: 'ok' })
    return true // Keep channel open for async responses
  }
)

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('Tab loaded:', tab.url)
  }
})
