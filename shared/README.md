# Shared Code

Shared code between VS Code and browser extensions.

This directory contains code that's used by both:
- VS Code extension
- Browser extension

## Structure

- `aiProvider/` - AI model implementations
- `utils/` - Utility functions
- `types/` - Shared TypeScript types
- `constants/` - Shared constants

## Usage

Import from shared directory:
```typescript
import { AIProvider } from '../../shared/aiProvider'
```
