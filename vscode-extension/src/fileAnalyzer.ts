

/**
 * ============================================
 * FILE ANALYZER - ANALYZE ANY CODE FILE
 * ============================================
 * 
 * Read and analyze any TypeScript/JavaScript file
 * Not just for errors, but for:
 * - Code review
 * - Understanding code
 * - Optimization suggestions
 * - Best practices
 * - Refactoring ideas
 */

import * as vscode from 'vscode';
import { getProviderManager } from './aiProvider/index';
import { AIProviderRequest } from './aiProvider/types';

export class FileAnalyzer {
  /**
   * Analyze current file
   */
  static async analyzeCurrentFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      vscode.window.showErrorMessage('❌ No file open');
      return;
    }

    const filePath = editor.document.fileName;
    const fileContent = editor.document.getText();
    const fileName = editor.document.fileName.split('/').pop() || 'unknown';

    console.log(`📄 Analyzing file: ${fileName}`);

    // Show analysis options
    const selectedType = await vscode.window.showQuickPick(
      [
        { label: '📖 Summary', description: 'Summarize what this file does' },
        { label: '🔍 Code Review', description: 'Review code for improvements' },
        {
          label: '⚡ Optimization',
          description: 'Suggest performance improvements',
        },
        {
          label: '✅ Best Practices',
          description: 'Check for best practices',
        },
        { label: '🔄 Refactoring', description: 'Suggest refactoring ideas' },
        { label: '❓ Custom Question', description: 'Ask a custom question' },
      ],
      {
        placeHolder: 'What do you want to analyze?',
      }
    );

    if (!selectedType) {
      return;
    }

    let question = '';
    if (selectedType.label.includes('Custom')) {
      const customQ = await vscode.window.showInputBox({
        prompt: 'Enter your question about this file:',
      });
      if (!customQ) return;
      question = customQ;
    } else {
      // Map selection to question
      const questionMap: { [key: string]: string } = {
        '📖 Summary': 'What does this file do? Summarize its purpose and main functions.',
        '🔍 Code Review': 'Review this code and suggest improvements. What could be done better?',
        '⚡ Optimization':
          'How can this code be optimized for better performance?',
        '✅ Best Practices': 'Check this code against TypeScript/JavaScript best practices. Any issues?',
        '🔄 Refactoring': 'What parts of this code could be refactored? Suggest improvements.',
      };
      question = questionMap[selectedType.label];
    }

    // Send to AI
    await this.askAIAboutFile(fileContent, fileName, filePath, question);
  }

  /**
   * Analyze file for specific function/method
   */
  static async analyzeSelection(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      vscode.window.showErrorMessage('❌ No file open');
      return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText) {
      vscode.window.showErrorMessage('❌ No code selected');
      return;
    }

    const fileName = editor.document.fileName.split('/').pop() || 'unknown';

    console.log(`📍 Analyzing selection in: ${fileName}`);

    const question = await vscode.window.showInputBox({
      prompt: 'What do you want to know about this code?',
      value: 'Explain what this code does',
    });

    if (!question) {
      return;
    }

    await this.askAIAboutFile(selectedText, fileName, editor.document.fileName, question);
  }

  /**
   * Send file analysis to AI
   */
  private static async askAIAboutFile(
    fileContent: string,
    fileName: string,
    filePath: string,
    question: string
  ): Promise<void> {
    try {
      const providerManager = getProviderManager();
      const activeProvider = providerManager.getActiveProvider();

      console.log(`🤖 Analyzing with ${activeProvider}...`);

      // Show progress
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Window,
          title: `🤖 Analyzing ${fileName}...`,
        },
        async (progress) => {
          progress.report({ increment: 33 });

          // Build request
          const request: AIProviderRequest = {
            question: question,
            codeContext: fileContent,
            errorMessage: '',
            filePath: filePath,
            errorType: 'analysis',
            maxTokens: 2000,
          };

          progress.report({ increment: 33 });

          // Send to AI
          const response = await providerManager.sendRequest(request);

          progress.report({ increment: 34 });

          if (response.success) {
            // Show response in output channel
            const outputChannel = vscode.window.createOutputChannel('🔴 RedBlink Analysis');
            outputChannel.clear();
            outputChannel.appendLine(`📄 File: ${fileName}`);
            outputChannel.appendLine(`❓ Question: ${question}`);
            outputChannel.appendLine(`🤖 Provider: ${response.provider}`);
            outputChannel.appendLine(`⏱️ Time: ${response.responseTime}ms\n`);
            outputChannel.appendLine('------- ANALYSIS -------\n');
            outputChannel.appendLine(response.text);
            outputChannel.appendLine('\n------- END -------');
            outputChannel.show();

            vscode.window.showInformationMessage(
              `✅ Analysis complete! Check Output panel.`
            );
          } else {
            vscode.window.showErrorMessage(
              `❌ Analysis failed: ${response.error}`
            );
          }
        }
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('❌ Error analyzing file:', msg);
      vscode.window.showErrorMessage(`❌ Error: ${msg}`);
    }
  }

  /**
   * Compare two files
   */
  static async compareFiles(): Promise<void> {
    vscode.window.showInformationMessage('📋 File comparison coming soon!');
  }

  /**
   * Generate file documentation
   */
  static async generateDocumentation(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      vscode.window.showErrorMessage('❌ No file open');
      return;
    }

    const fileContent = editor.document.getText();
    const fileName = editor.document.fileName.split('/').pop() || 'unknown';

    try {
      const providerManager = getProviderManager();

      const request: AIProviderRequest = {
        question: 'Generate comprehensive JSDoc/TypeScript documentation for this code. Include parameter descriptions, return types, and examples.',
        codeContext: fileContent,
        errorMessage: '',
        filePath: editor.document.fileName,
        errorType: 'documentation',
        maxTokens: 3000,
      };

      const response = await providerManager.sendRequest(request);

      if (response.success) {
        // Insert documentation above current selection or at top
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const position = new vscode.Position(0, 0);
          await editor.edit((editBuilder) => {
            editBuilder.insert(position, `${response.text}\n\n`);
          });

          vscode.window.showInformationMessage('✅ Documentation generated!');
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`❌ Error: ${msg}`);
    }
  }
}
