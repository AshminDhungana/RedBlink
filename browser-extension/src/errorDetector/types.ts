export interface DetectedError {
  id: string
  type: 'typescript' | 'eslint' | 'runtime'
  severity: 'error' | 'warning' | 'info'
  message: string
  file: string
  line: number
  column: number
  code?: string
  category?: string
  timestamp: number
}

export interface ErrorCategory {
  name: string
  pattern: RegExp
  description: string
}

export const ERROR_CATEGORIES: ErrorCategory[] = [
  {
    name: 'Type Error',
    pattern: /Cannot find name|Type .* is not assignable|is not assignable/,
    description: 'Type-related errors',
  },
  {
    name: 'Syntax Error',
    pattern: /Expected|Unexpected token|syntax/i,
    description: 'Syntax errors in code',
  },
  {
    name: 'Import Error',
    pattern: /Cannot find module|Module not found|Cannot resolve/i,
    description: 'Missing imports or modules',
  },
  {
    name: 'Runtime Error',
    pattern: /Cannot read|undefined is not|null is not/i,
    description: 'Runtime execution errors',
  },
]
