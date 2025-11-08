import { DetectedError, ERROR_CATEGORIES } from './types'

export class ErrorDetector {
  private errors: Map<string, DetectedError[]> = new Map()
  private callbacks: ((error: DetectedError) => void)[] = []
  private errorCounter = 0

  /**
   * Detect errors from text (like console output or error messages)
   */
  detectFromText(text: string, file: string): DetectedError[] {
    const detectedErrors: DetectedError[] = []
    const lines = text.split('\n')

    lines.forEach((line, index) => {
      // Skip empty lines
      if (!line.trim()) return

      // Check if line contains error keywords
      if (
        line.toLowerCase().includes('error') ||
        line.toLowerCase().includes('failed')
      ) {
        const error: DetectedError = {
          id: `error-${file}-${this.errorCounter++}`,
          type: 'typescript',
          severity: this.determineSeverity(line),
          message: line.trim(),
          file: file,
          line: index + 1,
          column: 0,
          category: this.categorizeError(line),
          timestamp: Date.now(),
        }

        detectedErrors.push(error)
        this.notifyListeners(error)
      }
    })

    // Store errors for this file
    if (detectedErrors.length > 0) {
      this.errors.set(file, detectedErrors)
    }

    return detectedErrors
  }

  /**
   * Detect errors from code (direct TypeScript/JavaScript)
   */
  detectFromCode(code: string, file: string): DetectedError[] {
    // For now, just treat it like text
    // Later, we'll parse actual AST
    return this.detectFromText(code, file)
  }

  /**
   * Categorize error based on message pattern
   */
  private categorizeError(message: string): string {
    for (const category of ERROR_CATEGORIES) {
      if (category.pattern.test(message)) {
        return category.name
      }
    }
    return 'Unknown Error'
  }

  /**
   * Determine severity level of error
   */
  private determineSeverity(
    message: string
  ): 'error' | 'warning' | 'info' {
    if (message.toLowerCase().includes('error')) return 'error'
    if (message.toLowerCase().includes('warning')) return 'warning'
    return 'info'
  }

  /**
   * Register callback for when error is detected
   */
  onErrorDetected(callback: (error: DetectedError) => void): void {
    this.callbacks.push(callback)
  }

  /**
   * Notify all listeners about a detected error
   */
  private notifyListeners(error: DetectedError): void {
    this.callbacks.forEach((callback) => {
      try {
        callback(error)
      } catch (e) {
        console.error('Error in callback:', e)
      }
    })
  }

  /**
   * Get errors for a specific file
   */
  getErrors(file: string): DetectedError[] {
    return this.errors.get(file) || []
  }

  /**
   * Get all errors
   */
  getAllErrors(): DetectedError[] {
    const all: DetectedError[] = []
    this.errors.forEach((errors) => {
      all.push(...errors)
    })
    return all
  }

  /**
   * Clear errors for a file
   */
  clearErrors(file: string): void {
    this.errors.delete(file)
  }

  /**
   * Clear all errors
   */
  clearAllErrors(): void {
    this.errors.clear()
  }
}

