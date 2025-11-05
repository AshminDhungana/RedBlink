# Contributing to RedBlink 🤝

Thank you for your interest in contributing! This guide explains how to help improve RedBlink.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Code of Conduct](#code-of-conduct)
3. [How to Contribute](#how-to-contribute)
4. [Development Setup](#development-setup)
5. [Making Changes](#making-changes)
6. [Testing](#testing)
7. [Submitting Changes](#submitting-changes)
8. [Review Process](#review-process)
9. [Style Guide](#style-guide)
10. [Getting Help](#getting-help)

---

## Getting Started

### Prerequisites

- Git
- Node.js 18+
- npm or yarn
- VS Code 1.80+
- Basic TypeScript knowledge (for code contributions)

### Fork & Clone

```bash
# 1. Fork the repository on GitHub
# (Click fork button on https://github.com/RedBlink/RedBlink)

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/RedBlink.git
cd RedBlink

# 3. Add upstream remote
git remote add upstream https://github.com/RedBlink/RedBlink.git

# 4. Verify remotes
git remote -v
# origin = your fork
# upstream = official repo
```

### Install Dependencies

```bash
# Install packages
npm install

# Install TypeScript globally (if not already)
npm install -g typescript

# Install VS Code Extension Generator (if not already)
npm install -g yo generator-code
```

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. We expect all contributors to:

✅ **Be respectful** - Treat everyone with kindness
✅ **Be constructive** - Provide helpful feedback
✅ **Be inclusive** - Welcome all skill levels
✅ **Be honest** - Acknowledge mistakes
✅ **Be collaborative** - Work together toward better solutions

### Unacceptable Behavior

❌ Harassment, discrimination, or hate speech
❌ Attacking individuals rather than ideas
❌ Sharing private information without consent
❌ Any illegal or unethical activity

### Reporting Issues

If you experience or witness unacceptable behavior:
1. Report to: conduct@redblink.dev
2. Include: What happened, who was involved, when/where
3. All reports kept confidential
4. Action taken promptly

---

## How to Contribute

### Ways to Help

#### 1. Report Bugs 🐛
- Found a bug? Open a GitHub issue
- Include: steps to reproduce, error message, screenshots
- Check existing issues first (no duplicates)
- Use bug report template

#### 2. Suggest Features 💡
- Have an idea? Open a feature request
- Explain: what it does, why needed, who benefits
- Include: examples and use cases
- Reference existing issues if related

#### 3. Improve Documentation 📖
- Fix typos or unclear sections
- Add examples or clarifications
- Improve tutorials
- Help with translation (future)

**No code needed!** Just comment on issues or submit pull requests to docs files.

#### 4. Fix Bugs 🔧
- Pick issue labeled "bug"
- Comment: "I'd like to work on this"
- Fix the issue
- Submit pull request

#### 5. Add Features ✨
- Pick issue labeled "enhancement"
- Comment: "I'd like to implement this"
- Implement feature
- Submit pull request

#### 6. Improve Tests ✅
- Add unit tests for new code
- Improve test coverage
- Fix flaky tests
- Improve test documentation

---

## Development Setup

### Initial Setup

```bash
# Clone (see Getting Started section above)

# Install dependencies
npm install

# Install git hooks (optional but recommended)
npm run setup-hooks
```

### Useful Commands

```bash
# Start VS Code extension in debug mode
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Run tests with coverage
npm run test -- --coverage

# Lint code
npm run lint

# Format code (Prettier)
npm run format

# Type check
npm run type-check
```

### Project Structure

```
RedBlink/
├── src/
│   ├── extension.ts           # Main entry point
│   ├── errorDetector.ts       # Error detection
│   ├── questionGenerator.ts   # Question generation
│   ├── aiProvider/            # AI integrations
│   ├── credentialStore.ts     # Secure storage
│   ├── ui/                    # UI components
│   │   ├── sidebar.ts
│   │   ├── sidebar.html
│   │   └── sidebar.css
│   └── utils/                 # Utility functions
├── test/                      # Test files
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/                      # Documentation
├── package.json
├── tsconfig.json
└── webpack.config.js
```

---

## Making Changes

### Create a Branch

```bash
# Update main from upstream
git fetch upstream
git rebase upstream/main

# Create feature branch
git checkout -b feature/my-feature
# or: git checkout -b fix/my-bug

# Use descriptive names:
# - feature/optional-chaining-detection
# - fix/api-key-validation-issue
# - docs/improve-getting-started
```

### Code Style

**We use:**
- **TypeScript** for type safety
- **ESLint** for linting (auto-fix: `npm run lint -- --fix`)
- **Prettier** for formatting (auto-format: `npm run format`)
- **Jest** for testing

**Rules:**
- Declare types explicitly
- Use const/let (no var)
- Use async/await (not promises)
- Add comments for complex logic
- One feature per commit

### Example: Adding a New AI Provider

**Step 1: Create provider file**
```typescript
// src/aiProvider/myai.ts

import { AIProvider, AIResponse } from './types'

export class MyAIProvider implements AIProvider {
  name = 'MyAI'
  model = 'myai-model'
  
  async sendMessage(prompt: string): Promise<AIResponse> {
    // Implementation here
  }
  
  async validateCredentials(): Promise<boolean> {
    // Validate API key
  }
  
  getCapabilities() {
    return {
      maxTokens: 1024,
      contextWindow: 2048,
      supportsStreaming: false
    }
  }
}
```

**Step 2: Register provider**
```typescript
// src/aiProvider/manager.ts

import { MyAIProvider } from './myai'

// In provider manager:
manager.registerProvider(new MyAIProvider())
```

**Step 3: Add tests**
```typescript
// test/unit/aiProvider/myai.test.ts

describe('MyAIProvider', () => {
  it('should send message correctly', async () => {
    // Test implementation
  })
})
```

**Step 4: Update documentation**
- Add to [API_MODELS.md](./API_MODELS.md)
- Add setup instructions

---

## Testing

### Run Tests

```bash
# Run all tests
npm run test

# Run specific test file
npm run test -- errorDetector.test.ts

# Run with coverage
npm run test -- --coverage

# Watch mode (re-run on changes)
npm run test -- --watch
```

### Writing Tests

**Test template:**
```typescript
describe('ErrorDetector', () => {
  let detector: ErrorDetector
  
  beforeEach(() => {
    detector = new ErrorDetector()
  })
  
  it('should detect TypeScript errors', async () => {
    const error = await detector.detectError('const x: string = 123')
    expect(error.type).toBe('TypeError')
  })
  
  it('should extract code context', () => {
    const context = detector.extractContext(error)
    expect(context.lines.length).toBeGreaterThan(0)
  })
})
```

**Coverage requirements:**
- Minimum 80% coverage
- All critical paths tested
- Edge cases covered
- Error scenarios tested

---

## Submitting Changes

### Before Submitting

```bash
# Make sure everything works
npm run lint           # Check code style
npm run type-check    # Check types
npm run test          # Run tests
npm run build         # Build succeeds

# Update your branch with latest changes
git fetch upstream
git rebase upstream/main
```

### Create Pull Request

**Step 1: Push to your fork**
```bash
git push origin feature/my-feature
```

**Step 2: Create PR on GitHub**
1. Go to: https://github.com/RedBlink/RedBlink
2. Click "New Pull Request"
3. Select: base=main, compare=your-branch
4. Fill in PR template:
   - Title: Clear, concise
   - Description: What changes & why
   - Related issues: "Fixes #123"
   - Screenshots: If UI changes

**PR Title Format:**
```
feat: Add optional chaining detection
fix: Resolve API key validation bug
docs: Improve getting started guide
test: Add coverage for error detector
```

**PR Description Template:**
```markdown
## Description
Brief explanation of changes

## Related Issues
Fixes #123

## Changes
- Change 1
- Change 2
- Change 3

## Testing
How to test:
1. ...
2. ...
3. ...

## Screenshots (if applicable)
[Add images]

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes
- [ ] Code follows style guide
```

---

## Review Process

### What to Expect

1. **Automated checks** (GitHub Actions)
   - Linting passed
   - Tests passed
   - Coverage OK
   - Build successful

2. **Code review** (1-3 business days)
   - At least 1 maintainer reviews
   - May request changes
   - Will provide constructive feedback

3. **Approval & merge** (after meeting requirements)
   - All feedback addressed
   - All checks passing
   - Merged to main

### Addressing Feedback

**If changes requested:**

1. **Review comments** - Understand feedback
2. **Make changes** - Implement fixes
3. **Push updates** - Commit to same branch
4. **PR auto-updates** - Changes appear in PR
5. **Comment** - Let reviewer know you're done

```bash
# Make changes
# ... edit files ...

# Commit
git add .
git commit -m "Address review feedback"

# Push (same branch, PR auto-updates)
git push origin feature/my-feature
```

### Getting Unstuck

**If feedback is unclear:**
- Ask for clarification: "I don't understand what you mean by..."
- Share your concern: "I tried X, but it didn't work because..."
- Suggest alternative: "What if we do it this way instead?"

**If changes feel unnecessary:**
- Explain the reasoning behind your approach
- Ask for alternative suggestions
- If still disagreed, maintainer decides

---

## Style Guide

### Code Style

**TypeScript:**
```typescript
// ✅ DO: Explicit types, clear names
const extractContext = (error: ErrorObject): CodeContext => {
  const lines = code.split('\n')
  const start = Math.max(0, error.line - 2)
  return { lines: lines.slice(start, start + 5), startLine: start }
}

// ❌ DON'T: Implicit types, unclear logic
const extractContext = (e: any) => {
  const l = c.split('\n')
  const s = Math.max(0, e.l - 2)
  return { l: l.slice(s, s + 5), s: s }
}
```

**Comments:**
```typescript
// ✅ DO: Explain WHY, not what
// Extract surrounding code context to provide better questions
// (Show up to 5 lines to give AI full picture)
const context = extractContext(error)

// ❌ DON'T: State the obvious
// Extract the context
const context = extractContext(error)
```

**Naming:**
```typescript
// ✅ DO: Descriptive, specific names
errorDetectionService
sendQuestionToAssistant()
credentialStore

// ❌ DON'T: Vague abbreviations
errServ
send()
store
```

### Git Commits

**Good commit messages:**
```
Add optional chaining detection for undefined properties

- Detect users?.[0]?.name pattern
- Generate questions for optional chaining usage
- Add tests for coverage
- Update documentation

Fixes #123
```

**Bad commit messages:**
```
fix stuff
update
work in progress
```

### Documentation

- Use clear, simple language
- Explain the "why", not just the "how"
- Include examples
- Update related docs
- Check for typos

---

## Getting Help

### Ask Questions

**Where to ask:**
- **GitHub Issues** - Technical questions (slower, but documented)
- **GitHub Discussions** - Design/architecture questions


**How to ask:**
1. Provide context (what are you working on?)
2. Share what you've tried
3. Include error messages or code
4. Be patient, wait for response

### Common Challenges

**Challenge: Setting up development environment**
- Solution: Follow [Development Setup](#development-setup) section above


**Challenge: Understanding the codebase**
- Solution: Read [ARCHITECTURE.md](./ARCHITECTURE.md)
- Or ask maintainers for guidance

**Challenge: Tests failing**
- Solution: Run `npm run test -- --watch` and debug
- Or ask for help with specific test

---

## Contributor Recognition

We celebrate contributors! 🎉

**What happens:**
1. PR merged → You're in the code
2. First contribution → Welcome to contributors list
3. Major contributions → Possible maintainer status
4. Regular help → Public recognition/credits

**Credits:**
- Listed in README.md
- Mentioned in release notes
- Recognized on website

---

## Questions?

- 📖 Check [documentation](./README.md)
- 🐛 [Create an issue](https://github.com/RedBlink/RedBlink/issues)

---

## Thank You! 🙏

Whether you're fixing bugs, improving docs, or suggesting features, your contributions make RedBlink better for everyone.

We're grateful for your help!

---

**Happy contributing! Let's build amazing debugging tools together! 🚀**