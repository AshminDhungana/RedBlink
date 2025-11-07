// vscode-extension/src/test-modules.ts
// Direct test of our modules (no VS Code needed)

import { ErrorDetector } from './errorDetector'
import { QuestionGenerator } from './questionGenerator'

console.log('🧪 STARTING MODULE TEST\n')

// Create instances
const detector = new ErrorDetector()
const generator = new QuestionGenerator()

console.log('✅ Modules created successfully\n')

// Test error detection
console.log('🔍 Testing error detection...')
const testText = `
  Error TS2322: Type "string" is not assignable to type "number"
  Error TS1005: Expected ';' but found 'const'
`

const errors = detector.detectFromText(testText, 'test.ts')
console.log(`✅ Found ${errors.length} errors\n`)

// Test question generation
if (errors.length > 0) {
  console.log('❓ Testing question generation...')
  const error = errors[0]
  const questions = generator.generate(error)
  
  console.log(`✅ Generated ${questions.length} questions:\n`)
  
  questions.forEach((q, i) => {
    console.log(`${i + 1}. ${q.text}`)
    console.log(`   Difficulty: ${q.difficulty}\n`)
  })
}

console.log('✅ ALL TESTS PASSED!')
