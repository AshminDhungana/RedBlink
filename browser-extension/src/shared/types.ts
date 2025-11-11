
export enum AIProviderType {
  CLAUDE = 'claude',
  OPENAI = 'openai',
  GEMINI = 'gemini',
  COPILOT = 'copilot',
  VSCODE_LM = 'vscode-lm',
}

export interface AIProviderRequest {
  question: string;
  codeContext: string;
  errorMessage: string;
  filePath: string;
  errorType: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIProviderResponse {
  id: string;
  text: string;
  provider: AIProviderType;
  responseTime: number;
  timestamp: Date;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  success: boolean;
  error?: string;
  stopReason?: string;
}

// ... (rest of your types.ts)
