
import type { DetectedError } from '../errorDetector'
import { Question, QuestionContext } from './types'

export class QuestionGenerator {
  private questionId = 0

  /**
   * Generate questions for a detected error
   */
  generate(error: DetectedError, _context?: QuestionContext): Question[] {
    const questions: Question[] = []

    // Get templates based on error category
    const templates = this.getTemplatesForCategory(
      error.category || 'Unknown Error'
    )

    // Create a Question for each template
    templates.forEach((template) => {
      const question = this.createQuestion(template, error)
      questions.push(question)
    })

    return questions
  }

  /**
   * Get question templates for specific error category
   */
  private getTemplatesForCategory(category: string): string[] {
    const templates: { [key: string]: string[] } = {
      'Type Error': [
        `What type is being assigned to this variable in "${category}"?`,
        `Why is this type incompatible with the expected type?`,
        `Have you checked what type TypeScript is inferring here?`,
      ],
      'Syntax Error': [
        `What syntax element is missing in this "${category}"?`,
        `Can you spot where the syntax violation occurs?`,
        `What bracket, semicolon, or keyword is missing?`,
      ],
      'Import Error': [
        `Does the file path in this import actually exist?`,
        `Is the export name spelled correctly in the imported file?`,
        `Did you export the item you're trying to import?`,
      ],
      'Runtime Error': [
        `What value is undefined or null at this point?`,
        `Did you initialize this variable before using it?`,
        `What step in the execution path causes this null reference?`,
      ],
      'Unknown Error': [
        `What does this error message tell you?`,
        `Have you encountered this error type before?`,
        `What code change triggered this error?`,
      ],
    }

    return templates[category] || templates['Unknown Error']
  }

  /**
   * Create a Question object from a template and error
   */
  private createQuestion(template: string, error: DetectedError): Question {
    return {
      id: `question-${this.questionId++}`,
      text: template,
      category: error.category || 'Unknown',
      relatedError: error.id,
      difficulty: this.determineDifficulty(error.category || ''),
      timestamp: Date.now(),
    }
  }

  /**
   * Determine difficulty level based on error category
   */
  private determineDifficulty(
    category: string
  ): 'beginner' | 'intermediate' | 'advanced' {
    if (category.includes('Syntax')) return 'beginner'
    if (category.includes('Type')) return 'intermediate'
    if (category.includes('Runtime')) return 'advanced'
    if (category.includes('Import')) return 'beginner'
    return 'intermediate'
  }
}
