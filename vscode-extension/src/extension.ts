
import * as vscode from 'vscode';
import { ErrorDetector } from './errorDetector';
import { QuestionGenerator } from './questionGenerator';
import { RedBlinkWebViewProvider } from './webViewProvider';
import {
  initCredentialManager,
  getCredentialManager,
} from './aiProvider/credentialManager';
import {
  initProviderManager,
  getProviderManager,
} from './aiProvider/index';
import { AIProviderType, AIProviderRequest } from './aiProvider/types';

/**
 * ============================================
 * REDBLINK EXTENSION - MAIN FILE
 * ============================================
 * 
 * Integrates all components:
 * - Error Detection
 * - Question Generation
 * - AI Providers (Gemini, Claude, OpenAI, Copilot)
 * - WebView UI
 * - Settings & Configuration
 * 
 * Global instances
 */

// Phase 1: Error Detection & Questions
let errorDetector: ErrorDetector;
let questionGenerator: QuestionGenerator;

// Phase 2: AI Providers
let credentialManager: ReturnType<typeof getCredentialManager> | null = null;
let providerManager: ReturnType<typeof getProviderManager> | null = null;

// Track active errors for UI updates
let activeErrors: Map<string, any> = new Map();

/**
 * ============================================
 * EXTENSION ACTIVATION
 * ============================================
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('\n🚀 RedBlink extension is now active!\n');

  try {
    // ===== PHASE 1: INITIALIZE CORE MODULES =====
    console.log('📦 Phase 1: Initializing core modules...');

    errorDetector = new ErrorDetector();
    questionGenerator = new QuestionGenerator();

    console.log('✅ ErrorDetector initialized');
    console.log('✅ QuestionGenerator initialized\n');

    // ===== PHASE 2: INITIALIZE AI PROVIDERS =====
    console.log('🤖 Phase 2: Initializing AI Providers...');

    // Initialize credential manager (for secure API key storage)
    const credentialMgr = initCredentialManager(context.secrets);
    credentialManager = credentialMgr;
    console.log('✅ Credential Manager initialized');

    // Initialize provider manager (for managing all 4 providers)
    const providerMgr = initProviderManager();
    providerManager = providerMgr;
    console.log('✅ Provider Manager initialized');

    // Initialize all providers
    await providerManager.initialize();
    console.log('✅ All AI Providers initialized\n');

    // ===== PHASE 3: WEBVIEW & UI =====
    console.log('🎨 Phase 3: Setting up WebView UI...');

    const webViewProvider = new RedBlinkWebViewProvider(context);
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        RedBlinkWebViewProvider.viewType,
        webViewProvider,
        {
          webviewOptions: {
            retainContextWhenHidden: true,
          },
        }
      )
    );
    console.log('✅ WebView provider registered\n');

    // ===== PHASE 4: ERROR DETECTION LISTENER =====
    console.log('👂 Phase 4: Setting up error listeners...');

    errorDetector.onErrorDetected((error) => {
      console.log('');
      console.log('🚨 ERROR DETECTED:');
      console.log(`   Type: ${error.type}`);
      console.log(`   Category: ${error.category}`);
      console.log(`   Message: ${error.message}`);
      console.log(`   Location: ${error.file}:${error.line}`);
      console.log('');

      // Generate questions for this error
      const questions = questionGenerator.generate(error);

      console.log(`❓ GENERATED ${questions.length} QUESTIONS:`);
      questions.forEach((question, index) => {
        console.log(`   ${index + 1}. ${question.text}`);
        console.log(`      (Difficulty: ${question.difficulty})`);
      });
      console.log('');

      // Store error for later use
      activeErrors.set(error.file + ':' + error.line, {
        error,
        questions,
      });

      // Update WebView with new error
      webViewProvider.updateErrors(Array.from(activeErrors.values()));
    });

    console.log('✅ Error detection listener registered\n');

    // ===== PHASE 5: COMMANDS =====
    console.log('⚙️ Phase 5: Registering commands...');

    // Command: Test error detection
    const testCommand = vscode.commands.registerCommand(
      'redblink.runAssistant',
      async () => {
        console.log('\n🧪 TEST: Running RedBlink Assistant...\n');

        // Get active provider
        const activeProvider = providerManager!.getActiveProvider();
        console.log(`📍 Using provider: ${activeProvider}`);

        // Simulate detecting an error
        const testError = errorDetector.detectFromText(
          'Error TS2322: Type "string" is not assignable to type "number"',
          'test.ts'
        );

        if (testError.length === 0) {
          vscode.window.showErrorMessage('❌ No errors detected in test');
          console.log('❌ No errors detected');
        } else {
          console.log(`✅ Test passed! Detected ${testError.length} error(s)`);

          // Generate questions
          const questions = questionGenerator.generate(testError[0]);
          console.log(`✅ Generated ${questions.length} questions`);

          // Try to get AI response with active provider
          try {
            const isAvailable = await providerManager!.getAvailableProviders();

            if (isAvailable.length === 0) {
              vscode.window.showWarningMessage(
                '⚠️ No AI providers configured. Add API keys in settings.'
              );
              console.log('⚠️ No providers available');
              return;
            }

            // Send request to AI
            const request: AIProviderRequest = {
              question: questions[0]?.text || 'What is this error?',
              codeContext: 'const x: number = "string";',
              errorMessage: testError[0].message,
              filePath: 'test.ts',
              errorType: testError[0].type,
              maxTokens: 500,
            };

            console.log('🔄 Sending request to AI provider...');
            const response = await providerManager!.sendRequest(request);

            if (response.success) {
              console.log('✅ AI Response received:');
              console.log(response.text);
              vscode.window.showInformationMessage(
                '✅ Test successful! Check console for AI response.'
              );
            } else {
              console.error('❌ AI request failed:', response.error);
              vscode.window.showErrorMessage(
                `❌ AI request failed: ${response.error}`
              );
            }
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Error during test:', msg);
            vscode.window.showErrorMessage(`Error: ${msg}`);
          }
        }
      }
    );
    context.subscriptions.push(testCommand);
    console.log('✅ Test Assistant command registered');

    // Command: Toggle sidebar
    const toggleCommand = vscode.commands.registerCommand(
      'redblink.toggleSidebar',
      () => {
        console.log('Toggle sidebar');
        vscode.commands.executeCommand('redblink-view.focus');
      }
    );
    context.subscriptions.push(toggleCommand);
    console.log('✅ Toggle sidebar command registered');

    // Command: Switch AI Provider
    const switchProviderCommand = vscode.commands.registerCommand(
      'redblink.switchProvider',
      async (provider: AIProviderType) => {
        try {
          console.log(`🔄 Switching to provider: ${provider}`);
          await providerManager!.switchProvider(provider);

          vscode.window.showInformationMessage(
            `✅ Switched to ${provider} provider`
          );
          console.log(`✅ Switched to ${provider}`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('Failed to switch provider:', msg);
          vscode.window.showErrorMessage(`Failed to switch provider: ${msg}`);
        }
      }
    );
    context.subscriptions.push(switchProviderCommand);
    console.log('✅ Switch provider command registered');

    // Command: Configure API Key
    const configureApiKeyCommand = vscode.commands.registerCommand(
      'redblink.configureApiKey',
      async () => {
        try {
          console.log('⚙️ Opening API key configuration...');

          // Ask user which provider
          const providers = [
            { label: 'Gemini', value: AIProviderType.GEMINI },
            { label: 'Claude', value: AIProviderType.CLAUDE },
            { label: 'ChatGPT', value: AIProviderType.OPENAI },
            { label: 'Copilot', value: AIProviderType.COPILOT },
          ];

          const selected = await vscode.window.showQuickPick(providers, {
            placeHolder: 'Select AI provider to configure',
          });

          if (!selected) {
            console.log('Configuration cancelled');
            return;
          }

          // Skip Copilot (no API key needed)
          if (selected.value === AIProviderType.COPILOT) {
            vscode.window.showInformationMessage(
              '✅ Copilot uses VS Code authentication. No API key needed!'
            );
            return;
          }

          // Ask for API key
          const apiKey = await vscode.window.showInputBox({
            prompt: `Enter ${selected.label} API key`,
            password: true,
            placeHolder: 'sk-...',
          });

          if (!apiKey) {
            console.log('API key input cancelled');
            return;
          }

          // Store API key
          await credentialManager!.setCredential(selected.value, apiKey);
          console.log(`✅ API key stored for ${selected.label}`);

          // Show success
          vscode.window.showInformationMessage(
            `✅ ${selected.label} API key saved successfully!`
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('API key configuration error:', msg);
          vscode.window.showErrorMessage(`Configuration error: ${msg}`);
        }
      }
    );
    context.subscriptions.push(configureApiKeyCommand);
    console.log('✅ Configure API key command registered');

    // Command: Show configured providers
    const showProvidersCommand = vscode.commands.registerCommand(
      'redblink.showProviders',
      async () => {
        try {
          const available = await providerManager!.getAvailableProviders();
          const active = providerManager!.getActiveProvider();
          const status = await providerManager!.getStatus();

          console.log('');
          console.log('📊 PROVIDER STATUS:');
          console.log(`   Active: ${active}`);
          console.log(`   Available: ${available.join(', ') || 'None configured'}`);
          console.log(`   Cache size: ${status.cacheSize}`);
          console.log(`   Queued requests: ${status.queuedRequests}`);
          console.log('');

          vscode.window.showInformationMessage(
            `Active: ${active} | Available: ${available.join(', ') || 'None'}`
          );
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('Error getting provider status:', msg);
        }
      }
    );
    context.subscriptions.push(showProvidersCommand);
    console.log('✅ Show providers command registered\n');

    // ===== PHASE 6: FILE CHANGE LISTENER =====
    console.log('📝 Phase 6: Setting up file listeners...');

    const onChangeDisposable = vscode.workspace.onDidChangeTextDocument(() => {
      // In the future: real-time error detection and refresh
      // For now: placeholder
    });
    context.subscriptions.push(onChangeDisposable);
    console.log('✅ Document change listener registered\n');

    // ===== PHASE 7: DIAGNOSTICS LISTENER (REAL ERROR DETECTION) =====
    console.log('🔍 Phase 7: Setting up diagnostics listener...');

    const onDiagnosticsChange = vscode.languages.onDidChangeDiagnostics((event) => {
      console.log('📊 Diagnostics changed');

      // Get all diagnostics
      for (const uri of event.uris) {
        const diagnostics = vscode.languages.getDiagnostics(uri);

        if (diagnostics.length === 0) {
          continue;
        }

        console.log(`   File: ${uri.fsPath}`);
        console.log(`   Diagnostics: ${diagnostics.length}`);

        // Process each diagnostic
        for (const diag of diagnostics) {
          console.log(
            `   - ${diag.severity === 0 ? 'ERROR' : 'WARNING'}: ${diag.message}`
          );

          // TODO: Convert VS Code diagnostic to our ErrorObject
          // and add to activeErrors
        }
      }
    });
    context.subscriptions.push(onDiagnosticsChange);
    console.log('✅ Diagnostics listener registered\n');

    // ===== INITIALIZATION COMPLETE =====
    console.log('✨ RedBlink extension fully initialized!\n');

    // Show welcome message with setup instructions
    vscode.window.showInformationMessage(
      '🚀 RedBlink activated! Configure AI providers: Cmd+Shift+P → "RedBlink: Configure API Key"'
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('❌ Extension activation error:', msg);
    vscode.window.showErrorMessage(`RedBlink activation error: ${msg}`);
  }
}

/**
 * ============================================
 * EXTENSION DEACTIVATION
 * ============================================
 */
export async function deactivate() {
  console.log('\n🔵 RedBlink extension deactivating...\n');

  try {
    // Cleanup provider manager
    if (providerManager) {
      await providerManager.dispose();
      console.log('✅ Provider manager cleaned up');
    }

    // Clear active errors
    activeErrors.clear();
    console.log('✅ Active errors cleared');

    console.log('\n✅ RedBlink extension deactivated\n');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error during deactivation:', msg);
  }
}
