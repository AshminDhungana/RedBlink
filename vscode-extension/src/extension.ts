// vscode-extension/src/extension.ts

import * as vscode from 'vscode'
import { ErrorDetector } from './errorDetector'
import { QuestionGenerator } from './questionGenerator'
import { RedBlinkWebViewProvider } from './webViewProvider'

// Global instances
let errorDetector: ErrorDetector
let questionGenerator: QuestionGenerator

export function activate(context: vscode.ExtensionContext) {
  console.log('\n🚀 RedBlink extension is now active!\n')

  // Initialize modules
  errorDetector = new ErrorDetector()
  questionGenerator = new QuestionGenerator()

  console.log('✅ ErrorDetector initialized')
  console.log('✅ QuestionGenerator initialized\n')

  // ===== WEBVIEW SIDEBAR SETUP =====
  const webViewProvider = new RedBlinkWebViewProvider(context)
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
  )
  console.log('✅ WebView provider registered')

  // ===== ERROR DETECTION LISTENER =====
  errorDetector.onErrorDetected((error) => {
    console.log('')
    console.log('🚨 ERROR DETECTED:')
    console.log(`   Type: ${error.type}`)
    console.log(`   Category: ${error.category}`)
    console.log(`   Message: ${error.message}`)
    console.log(`   Location: ${error.file}:${error.line}`)
    console.log('')

    // Generate questions for this error
    const questions = questionGenerator.generate(error)

    console.log(`❓ GENERATED ${questions.length} QUESTIONS:`)
    questions.forEach((question, index) => {
      console.log(`   ${index + 1}. ${question.text}`)
      console.log(`      (Difficulty: ${question.difficulty})`)
    })
    console.log('')
  })

  // ===== COMMANDS =====

  // Test error detection command
  const runCommand = vscode.commands.registerCommand(
    'redblink.runAssistant',
    () => {
      console.log('\n🧪 TEST: Running RedBlink Assistant...\n')

      // Simulate detecting an error
      const testError = errorDetector.detectFromText(
        'Error TS2322: Type "string" is not assignable to type "number"',
        'test.ts'
      )

      if (testError.length === 0) {
        console.log('❌ No errors detected in test')
      } else {
        console.log(`✅ Test passed! Detected ${testError.length} error(s)`)
      }
    }
  )
  context.subscriptions.push(runCommand)
  console.log('✅ Run Assistant command registered')

  // Toggle sidebar command
  const toggleCommand = vscode.commands.registerCommand(
    'redblink.toggleSidebar',
    () => {
      console.log('Toggle sidebar command executed')
      vscode.commands.executeCommand('redblink-view.focus')
    }
  )
  context.subscriptions.push(toggleCommand)
  console.log('✅ Toggle sidebar command registered')

  // ===== FILE CHANGE LISTENER =====
  const onChangeDisposable = vscode.workspace.onDidChangeTextDocument(() => {
    // In the future: refresh diagnostics when file changes
    console.log('📝 Document changed (diagnostic refresh coming soon)')
  })
  context.subscriptions.push(onChangeDisposable)
  console.log('✅ Document change listener registered')

  // Show welcome message
  vscode.window.showInformationMessage('🚀 RedBlink activated! Check the sidebar →')

  console.log('✅ RedBlink extension fully initialized\n')
}

export function deactivate() {
  console.log('\n🔵 RedBlink extension deactivated\n')
}
