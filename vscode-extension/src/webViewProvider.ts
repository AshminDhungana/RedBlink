
import * as vscode from 'vscode';
import { ErrorDetector } from './errorDetector';
import { QuestionGenerator } from './questionGenerator';
import { getProviderManager } from './aiProvider/index';
import { getCredentialManager } from './aiProvider/credentialManager';
import { AIProviderType, AIProviderRequest } from './aiProvider/types';

/**
 * ============================================
 * REDBLINK WEBVIEW PROVIDER
 * ============================================
 * 
 * Enhanced version that combines:
 * - Clean UI from original
 * - Real error detection
 * - AI provider integration (Gemini, Claude, ChatGPT, Copilot)
 * - Real diagnostics from VS Code
 */
export class RedBlinkWebViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'redblink-view';

  private view?: vscode.WebviewView;
  private errorDetector: ErrorDetector;
  private questionGenerator: QuestionGenerator;
  private detectedErrors: any[] = [];
  private context: vscode.ExtensionContext;

  // Track AI responses for each error
  private aiResponses: Map<string, any> = new Map();

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.errorDetector = new ErrorDetector();
    this.questionGenerator = new QuestionGenerator();
  }

  /**
   * ============================================
   * WEBVIEW LIFECYCLE
   * ============================================
   */

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext<unknown>,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this.view = webviewView;

    // Configure webview
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    // Set initial HTML
    webviewView.webview.html = this.getHtmlContent();

    // Listen for messages from webview
    webviewView.webview.onDidReceiveMessage(async (data) => {
      console.log('📨 Message from webview:', data.type);

      switch (data.type) {
        case 'refresh':
          this.refreshErrors();
          break;

        case 'test':
          this.testError();
          break;

        case 'askAI':
          await this.askAI(data);
          break;

        case 'switchProvider':
          await this.switchProvider(data.provider);
          break;

        case 'configureApiKey':
          await this.configureApiKey(data.provider);
          break;

        case 'dismissError':
          this.dismissError(data.errorId);
          break;

        case 'getStatus':
          await this.sendStatus();
          break;
      }
    });

    // Initial refresh
    this.refreshErrors();

    // Listen for diagnostics changes
    const onDiagnosticsChange = vscode.languages.onDidChangeDiagnostics(() => {
      this.refreshErrors();
    });
    this.context.subscriptions.push(onDiagnosticsChange);
  }

  /**
   * ============================================
   * ERROR DETECTION
   * ============================================
   */

  private refreshErrors(): void {
    console.log('🔄 Refreshing errors from VS Code diagnostics...');

    // Get diagnostics from all open files
    const diagnostics = vscode.languages.getDiagnostics();
    this.detectedErrors = [];

    diagnostics.forEach(([uri, diags]) => {
      diags.forEach((diag) => {
        // Convert VS Code diagnostic to our error format
        const error = this.errorDetector.detectFromText(diag.message, uri.fsPath);

        if (error.length > 0) {
          error.forEach((e) => {
            const questions = this.questionGenerator.generate(e);
            const errorId = `${uri.fsPath}:${diag.range.start.line}`;

            this.detectedErrors.push({
              id: errorId,
              ...e,
              questions: questions,
              line: diag.range.start.line + 1,
              file: uri.fsPath.split('\\').pop() || uri.fsPath,
              fullPath: uri.fsPath,
              severity: diag.severity === 0 ? 'ERROR' : 'WARNING',
            });
          });
        }
      });
    });

    console.log(`📊 Found ${this.detectedErrors.length} errors`);
    this.updateWebview();
  }

  private testError(): void {
    console.log('🧪 Testing with sample error...');

    const testError = this.errorDetector.detectFromText(
      'Error TS2322: Type "string" is not assignable to type "number"',
      'test.ts'
    );

    if (testError.length > 0) {
      const error = testError[0];
      const questions = this.questionGenerator.generate(error);
      const errorId = 'test-error-42';

      this.detectedErrors = [
        {
          id: errorId,
          ...error,
          questions: questions,
          line: 42,
          file: 'test.ts',
          fullPath: 'test.ts',
          severity: 'ERROR',
        },
      ];

      this.updateWebview();
    }
  }

  /**
   * ============================================
   * AI INTEGRATION
   * ============================================
   */

  private async askAI(data: any): Promise<void> {
    console.log(`🤖 Asking AI about error: ${data.errorId}`);

    try {
      // Get provider manager
      const providerManager = getProviderManager();
      const activeProvider = providerManager.getActiveProvider();

      console.log(`📍 Using provider: ${activeProvider}`);

      // Check if provider available
      const available = await providerManager.getAvailableProviders();
      if (available.length === 0) {
        this.sendMessage({
          type: 'error',
          message: '❌ No AI providers configured. Go to settings to add API key.',
        });
        return;
      }

      // Find the error
      const error = this.detectedErrors.find((e) => e.id === data.errorId);
      if (!error) {
        console.error('Error not found:', data.errorId);
        return;
      }

      // Show loading
      this.sendMessage({
        type: 'loading',
        errorId: data.errorId,
        message: `Asking ${activeProvider}...`,
      });

      // Build AI request
      const request: AIProviderRequest = {
        question: data.question || error.questions[0]?.text || 'What is this error?',
        codeContext: data.codeContext || 'const x: number = "string";',
        errorMessage: error.message,
        filePath: error.file,
        errorType: error.type,
        maxTokens: 1000,
      };

      // Send to AI
      const response = await providerManager.sendRequest(request);

      if (response.success) {
        console.log('✅ AI response received');

        // Store response
        this.aiResponses.set(data.errorId, response);

        // Send to webview
        this.sendMessage({
          type: 'aiResponse',
          errorId: data.errorId,
          response: {
            text: response.text,
            provider: response.provider,
            responseTime: response.responseTime,
            tokenUsage: response.tokenUsage,
          },
        });
      } else {
        this.sendMessage({
          type: 'error',
          message: `❌ AI request failed: ${response.error}`,
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('❌ Error asking AI:', msg);
      this.sendMessage({
        type: 'error',
        message: `❌ Error: ${msg}`,
      });
    }
  }

  private async switchProvider(provider: AIProviderType): Promise<void> {
    try {
      console.log(`🔄 Switching to ${provider}`);

      const providerManager = getProviderManager();
      await providerManager.switchProvider(provider);

      this.sendMessage({
        type: 'providerSwitched',
        provider: provider,
        message: `✅ Switched to ${provider}`,
      });

      console.log(`✅ Switched to ${provider}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Failed to switch provider:', msg);
      this.sendMessage({
        type: 'error',
        message: `Failed to switch provider: ${msg}`,
      });
    }
  }

  private async configureApiKey(provider: AIProviderType): Promise<void> {
    try {
      console.log(`⚙️ Configuring API key for ${provider}`);

      // Copilot doesn't need API key
      if (provider === AIProviderType.COPILOT) {
        vscode.window.showInformationMessage(
          '✅ Copilot uses VS Code authentication. No API key needed!'
        );
        return;
      }

      // Ask for API key
      const apiKey = await vscode.window.showInputBox({
        prompt: `Enter ${provider} API key`,
        password: true,
        placeHolder: 'sk-...',
      });

      if (!apiKey) {
        return; // User cancelled
      }

      // Store API key
      const credentialManager = getCredentialManager();
      await credentialManager.setCredential(provider, apiKey);

      this.sendMessage({
        type: 'apiKeyConfigured',
        provider: provider,
      });

      console.log(`✅ API key configured for ${provider}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Error configuring API key:', msg);
      this.sendMessage({
        type: 'error',
        message: `Error: ${msg}`,
      });
    }
  }

  private dismissError(errorId: string): void {
    console.log(`🗑️ Dismissing error: ${errorId}`);
    this.detectedErrors = this.detectedErrors.filter((e) => e.id !== errorId);
    this.aiResponses.delete(errorId);
    this.updateWebview();
  }

  private async sendStatus(): Promise<void> {
    try {
      const providerManager = getProviderManager();
      const credentialManager = getCredentialManager();

      const active = providerManager.getActiveProvider();
      const available = await providerManager.getAvailableProviders();
      const credentialStatus = await credentialManager.getCredentialStatus();

      this.sendMessage({
        type: 'status',
        activeProvider: active,
        availableProviders: available,
        credentialStatus: credentialStatus,
      });
    } catch (error) {
      console.error('Error getting status:', error);
    }
  }

  /**
   * ============================================
   * UI UPDATES
   * ============================================
   */

  private updateWebview(): void {
    if (!this.view) {
      return;
    }

    this.view.webview.html = this.getHtmlContent();
  }

  private sendMessage(message: any): void {
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }

  /**
   * ============================================
   * HTML CONTENT
   * ============================================
   */

  private getHtmlContent(): string {
    const errorCount = this.detectedErrors.length;

    let errorsHtml = '';

    if (errorCount === 0) {
      errorsHtml = `
        <div class="empty-state">
          <div class="empty-icon">✓</div>
          <div class="empty-text">No errors detected!</div>
          <button onclick="testError()">Test with Sample Error</button>
        </div>
      `;
    } else {
      errorsHtml = this.detectedErrors
        .map((error) => {
          const questionsHtml = error.questions
            .map((q: any, idx: number) => {
              return `
              <div class="question" onclick="askAI('${error.id}', '${q.text.replace(/'/g, "\\'")}')">
                <div class="question-text">❓ ${q.text}</div>
                <div class="question-difficulty">${q.difficulty}</div>
              </div>
            `;
            })
            .join('');

          const aiResponseHtml = this.aiResponses.has(error.id)
            ? `
              <div class="ai-response" id="response-${error.id}">
                <div class="ai-response-header">✅ ${this.aiResponses.get(error.id).provider}</div>
                <div class="ai-response-text">${this.escapeHtml(
                  this.aiResponses.get(error.id).text
                )}</div>
                <div class="ai-response-meta">
                  ⏱️ ${this.aiResponses.get(error.id).responseTime}ms
                </div>
              </div>
            `
            : '';

          return `
          <div class="error-card" id="error-${error.id}">
            <div class="error-header">
              <span class="error-icon">${error.severity === 'ERROR' ? '❌' : '⚠️'}</span>
              <span class="error-type">${error.category}</span>
              <span class="error-line">[Ln ${error.line}]</span>
              <button class="close-btn" onclick="dismissError('${error.id}')" title="Dismiss">✕</button>
            </div>
            <div class="error-message">${this.escapeHtml(error.message)}</div>
            <div class="error-file">${error.file}</div>
            <div class="questions-container">
              ${questionsHtml}
            </div>
            ${aiResponseHtml}
            <div id="loading-${error.id}"></div>
          </div>
        `;
        })
        .join('');
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
            font-size: 12px;
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

          .provider-info {
            background: var(--vscode-notifications-background);
            padding: 8px;
            border-radius: 4px;
            margin-bottom: 12px;
            font-size: 11px;
            border-left: 3px solid var(--vscode-editorWarning-foreground);
          }

          .provider-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 4px;
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

          .provider-btn {
            flex: 1;
            background: var(--vscode-editorWarning-foreground);
          }

          .provider-btn:hover {
            opacity: 0.9;
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

          .close-btn {
            padding: 2px 6px;
            font-size: 11px;
            background: transparent;
            border: none;
            cursor: pointer;
            color: var(--vscode-descriptionForeground);
          }

          .close-btn:hover {
            color: #ff4444;
          }

          .error-message {
            font-size: 12px;
            color: var(--vscode-editor-foreground);
            margin-bottom: 6px;
            padding: 6px 8px;
            background: rgba(255, 68, 68, 0.1);
            border-radius: 3px;
            border-left: 2px solid #ff4444;
            word-break: break-word;
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
            margin-bottom: 8px;
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

          .ai-response {
            padding: 8px;
            background: rgba(100, 200, 100, 0.1);
            border-left: 2px solid #64c864;
            border-radius: 3px;
            margin-top: 8px;
            max-height: 200px;
            overflow-y: auto;
          }

          .ai-response-header {
            font-weight: 600;
            color: #64c864;
            margin-bottom: 6px;
            font-size: 11px;
          }

          .ai-response-text {
            font-size: 11px;
            color: var(--vscode-editor-foreground);
            line-height: 1.4;
            white-space: pre-wrap;
            word-wrap: break-word;
            margin-bottom: 6px;
          }

          .ai-response-meta {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            border-top: 1px solid var(--vscode-panel-border);
            padding-top: 4px;
          }

          .loading {
            padding: 6px 8px;
            color: var(--vscode-editorWarning-foreground);
            animation: pulse 1.5s ease-in-out infinite;
          }

          @keyframes pulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }

          .error-message-box {
            padding: 8px;
            background: var(--vscode-errorForeground);
            color: white;
            border-radius: 3px;
            margin-bottom: 8px;
            font-size: 11px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-icon">🔴</div>
          <div class="header-title">RedBlink</div>
          <div class="error-count">${errorCount}</div>
        </div>

        <div class="provider-info" id="provider-info">
          <div class="provider-row">
            <strong>Provider:</strong>
            <span id="active-provider">-</span>
          </div>
          <div class="provider-row">
            <strong>Available:</strong>
            <span id="available-providers">-</span>
          </div>
          <button class="provider-btn" style="width: 100%; margin-top: 8px;" onclick="switchProvider()">
            ⚙️ Configure Provider
          </button>
        </div>

        <div class="toolbar">
          <button onclick="refresh()">🔄 Refresh</button>
          <button onclick="testError()">🧪 Test</button>
        </div>

        <div id="error-messages"></div>

        <div class="errors-list">
          ${errorsHtml}
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          // Message handler
          window.addEventListener('message', (event) => {
            const message = event.data;
            console.log('Message received:', message.type);

            switch (message.type) {
              case 'aiResponse':
                displayAiResponse(message.errorId, message.response);
                break;

              case 'loading':
                showLoading(message.errorId, message.message);
                break;

              case 'error':
                showError(message.message);
                break;

              case 'status':
                updateStatus(message);
                break;

              case 'providerSwitched':
                showMessage('✅ ' + message.message);
                break;

              case 'apiKeyConfigured':
                showMessage('✅ API key configured!');
                break;
            }
          });

          function refresh() {
            vscode.postMessage({ type: 'refresh' });
          }

          function testError() {
            vscode.postMessage({ type: 'test' });
          }

          function askAI(errorId, question) {
            const loadingDiv = document.getElementById('loading-' + errorId);
            loadingDiv.innerHTML = '<div class="loading">Asking AI...</div>';

            vscode.postMessage({
              type: 'askAI',
              errorId: errorId,
              question: question,
              codeContext: 'const x: number = "string";'
            });
          }

          function displayAiResponse(errorId, response) {
            const responseDiv = document.getElementById('response-' + errorId);
            const loadingDiv = document.getElementById('loading-' + errorId);

            loadingDiv.innerHTML = '';

            if (responseDiv) {
              responseDiv.remove();
            }

            const html = \`
              <div class="ai-response" id="response-\${errorId}">
                <div class="ai-response-header">✅ \${response.provider}</div>
                <div class="ai-response-text">\${escapeHtml(response.text)}</div>
                <div class="ai-response-meta">
                  ⏱️ \${response.responseTime}ms
                </div>
              </div>
            \`;

            document.getElementById('error-' + errorId).insertAdjacentHTML('beforeend', html);
          }

          function dismissError(errorId) {
            vscode.postMessage({
              type: 'dismissError',
              errorId: errorId
            });
          }

          function switchProvider() {
            const options = ['Gemini', 'Claude', 'ChatGPT', 'Copilot'];
            // In real implementation, show quickpick menu
            // For now, just send switch request
            vscode.postMessage({ type: 'getStatus' });
          }

          function updateStatus(message) {
            document.getElementById('active-provider').textContent = message.activeProvider || '-';
            const available = message.availableProviders || [];
            document.getElementById('available-providers').textContent = 
              available.length > 0 ? available.join(', ') : 'None configured';
          }

          function showLoading(errorId, message) {
            const div = document.getElementById('loading-' + errorId);
            if (div) {
              div.innerHTML = '<div class="loading">' + message + '</div>';
            }
          }

          function showError(message) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message-box';
            errorDiv.textContent = message;
            const container = document.getElementById('error-messages');
            if (container) {
              container.appendChild(errorDiv);
              setTimeout(() => errorDiv.remove(), 5000);
            }
          }

          function showMessage(message) {
            // Show as temporary message
            const div = document.createElement('div');
            div.textContent = message;
            div.style.padding = '8px';
            div.style.background = 'var(--vscode-editorWarning-foreground)';
            div.style.marginBottom = '8px';
            div.style.borderRadius = '3px';
            document.querySelector('.toolbar').insertAdjacentElement('afterend', div);
            setTimeout(() => div.remove(), 3000);
          }

          function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
          }

          // Get initial status
          vscode.postMessage({ type: 'getStatus' });
        </script>
      </body>
      </html>
    `;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
