
import * as vscode from 'vscode'
import { ErrorDetector } from './errorDetector'
import { QuestionGenerator } from './questionGenerator'

export class RedBlinkWebViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'redblink-view'
  private view?: vscode.WebviewView
  private errorDetector: ErrorDetector
  private questionGenerator: QuestionGenerator
  private detectedErrors: any[] = []

  constructor(
    private readonly context: vscode.ExtensionContext
  ) {
    this.errorDetector = new ErrorDetector()
    this.questionGenerator = new QuestionGenerator()
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext<unknown>,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this.view = webviewView

    // Configure webview
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    }

    // Set initial HTML
    webviewView.webview.html = this.getHtmlContent()

    // Listen for messages from webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      console.log('Message from webview:', data)

      if (data.type === 'refresh') {
        this.refreshErrors()
      }
      if (data.type === 'test') {
        this.testError()
      }
    })

    // Refresh on load
    this.refreshErrors()
  }

  private refreshErrors(): void {
    console.log('🔄 Refreshing errors...')

    // Get diagnostics from all open files
    const diagnostics = vscode.languages.getDiagnostics()
    this.detectedErrors = []

    diagnostics.forEach(([uri, diags]) => {
      diags.forEach((diag) => {
        // Convert VS Code diagnostic to our error format
        const error = this.errorDetector.detectFromText(
          diag.message,
          uri.fsPath
        )

        if (error.length > 0) {
          error.forEach((e) => {
            const questions = this.questionGenerator.generate(e)
            this.detectedErrors.push({
              ...e,
              questions: questions,
              line: diag.range.start.line + 1,
              file: uri.fsPath.split('\\').pop(),
            })
          })
        }
      })
    })

    console.log(`📊 Found ${this.detectedErrors.length} errors`)
    this.updateWebview()
  }

  private testError(): void {
    console.log('🧪 Testing with sample error...')

    const testError = this.errorDetector.detectFromText(
      'Error TS2322: Type "string" is not assignable to type "number"',
      'test.ts'
    )

    if (testError.length > 0) {
      const error = testError[0]
      const questions = this.questionGenerator.generate(error)
      this.detectedErrors = [
        {
          ...error,
          questions: questions,
          line: 42,
          file: 'test.ts',
        },
      ]
      this.updateWebview()
    }
  }

  private updateWebview(): void {
    if (!this.view) {
      return
    }

    this.view.webview.html = this.getHtmlContent()
  }

  private getHtmlContent(): string {
    const errorCount = this.detectedErrors.length

    let errorsHtml = ''

    if (errorCount === 0) {
      errorsHtml = `
        <div class="empty-state">
          <div class="empty-icon">✓</div>
          <div class="empty-text">No errors detected!</div>
          <button onclick="testError()">Test with Sample Error</button>
        </div>
      `
    } else {
      errorsHtml = this.detectedErrors
        .map((error) => {
          const questionsHtml = error.questions
            .map((q: any) => {
              return `
              <div class="question">
                <div class="question-text">❓ ${q.text}</div>
                <div class="question-difficulty">${q.difficulty}</div>
              </div>
            `
            })
            .join('')

          return `
          <div class="error-card">
            <div class="error-header">
              <span class="error-icon">❌</span>
              <span class="error-type">${error.category}</span>
              <span class="error-line">[Ln ${error.line}]</span>
            </div>
            <div class="error-message">${error.message}</div>
            <div class="error-file">${error.file}</div>
            <div class="questions-container">
              ${questionsHtml}
            </div>
          </div>
        `
        })
        .join('')
    }

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>RedBlink</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            padding: 16px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
          }

          .header {
            display: flex;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
          }

          .header-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-editor-foreground);
            flex: 1;
          }

          .header-icon {
            font-size: 20px;
            margin-right: 8px;
          }

          .error-count {
            background: #ff4444;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
          }

          .toolbar {
            display: flex;
            gap: 8px;
            margin-bottom: 16px;
          }

          button {
            padding: 6px 12px;
            border: 1px solid var(--vscode-button-border);
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            transition: background 0.2s;
          }

          button:hover {
            background: var(--vscode-button-hoverBackground);
          }

          .empty-state {
            text-align: center;
            padding: 40px 16px;
            color: var(--vscode-descriptionForeground);
          }

          .empty-icon {
            font-size: 48px;
            margin-bottom: 12px;
          }

          .empty-text {
            font-size: 14px;
            margin-bottom: 16px;
          }

          .errors-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .error-card {
            border: 1px solid var(--vscode-panel-border);
            border-left: 4px solid #ff4444;
            border-radius: 4px;
            padding: 12px;
            background: var(--vscode-editor-background);
          }

          .error-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            font-weight: 600;
            font-size: 13px;
          }

          .error-icon {
            font-size: 14px;
          }

          .error-type {
            color: #ff4444;
          }

          .error-line {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            margin-left: auto;
          }

          .error-message {
            font-size: 12px;
            color: var(--vscode-editor-foreground);
            margin-bottom: 6px;
            padding: 6px 8px;
            background: rgba(255, 68, 68, 0.1);
            border-radius: 3px;
            border-left: 2px solid #ff4444;
          }

          .error-file {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
          }

          .questions-container {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .question {
            padding: 8px;
            background: rgba(100, 200, 255, 0.1);
            border-left: 2px solid #64c8ff;
            border-radius: 3px;
            cursor: pointer;
            transition: background 0.2s;
          }

          .question:hover {
            background: rgba(100, 200, 255, 0.2);
          }

          .question-text {
            font-size: 12px;
            color: var(--vscode-editor-foreground);
            margin-bottom: 4px;
          }

          .question-difficulty {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-icon">🔴</div>
          <div class="header-title">RedBlink</div>
          <div class="error-count">${errorCount}</div>
        </div>

        <div class="toolbar">
          <button onclick="refresh()">🔄 Refresh</button>
          <button onclick="testError()">🧪 Test</button>
        </div>

        <div class="errors-list">
          ${errorsHtml}
        </div>

        <script>
          const vscode = acquireVsCodeApi()

          function refresh() {
            vscode.postMessage({ type: 'refresh' })
          }

          function testError() {
            vscode.postMessage({ type: 'test' })
          }
        </script>
      </body>
      </html>
    `
  }
}
