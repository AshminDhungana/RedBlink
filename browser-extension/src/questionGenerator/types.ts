// vscode-extension/src/questionGenerator/types.ts

import type { DetectedError } from '../errorDetector'

export interface Question {
  id: string
  text: string
  category: string
  relatedError: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  timestamp: number
}

export interface QuestionContext {
  error: DetectedError
  codeSnippet?: string
  errorLine?: string
}
