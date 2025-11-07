// vscode-extension/src/extension.ts

import * as vscode from 'vscode'
import { ErrorDetector } from './errorDetector'
import { QuestionGenerator } from './questionGenerator'

// Global instances
let errorDetector: ErrorDetector
let questionGenerator: QuestionGenerator

export function activate(context: vscode.ExtensionContext) {
  console.log('🚀 RedBlink extension is now active!')

  // Initialize modules
  errorDetector = new ErrorDetector()
  questionGenerator = new QuestionGenerator()

  console.log('✅ ErrorDetector initialized')
  console.log('✅ QuestionGenerator initialized')

  // Listen for errors
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

// Register a command to test error detection
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


  // Register toggle sidebar command
  const toggleCommand = vscode.commands.registerCommand(
    'redblink.toggleSidebar',
    () => {
      vscode.window.showInformationMessage(
        '🔴 RedBlink: Sidebar feature coming soon!'
      )
    }
  )

  // Add commands to subscriptions (cleanup on deactivate)
  context.subscriptions.push(toggleCommand)

  // Show welcome message
  vscode.window.showInformationMessage('🚀 RedBlink activated!')
}

export function deactivate() {
  console.log('🔵 RedBlink extension deactivated')
}
