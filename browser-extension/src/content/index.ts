
console.log('RedBlink content script injected')

// Listen for errors on the page
window.addEventListener('error', (event: ErrorEvent) => {
  console.error('Error detected:', event.error)
  
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
  console.error('Unhandled rejection:', event.reason)
  
  chrome.runtime.sendMessage({
    type: 'PROMISE_REJECTION',
    data: event.reason,
  })
})
