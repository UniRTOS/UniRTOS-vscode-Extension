import * as vscode from 'vscode';
import { runBasicEnvChecks } from './checkView';
import { runCliCommandWithStreaming } from './pythonCli';

export async function runBuildScript(workspaceRoot: string, context: vscode.ExtensionContext): Promise<boolean> {
  // run basic environment checks first
  try {
    const basic = runBasicEnvChecks(context);
    if (!basic.configPassed) {
      vscode.window.showErrorMessage((basic.reason || 'unknown') + ' Environment checks failed.');
      return false;
    }
  } catch (e) {
    vscode.window.showErrorMessage('Failed to run environment checks: ' + String(e));
    return false;
  }

  // 1. create output channel
  const output = vscode.window.createOutputChannel('UniRTOS Build');
  output.show();
  output.appendLine('Starting build process....');

  // 2. Run build command
  try {
    await runCliCommandWithStreaming(['build', '-d', workspaceRoot], output, workspaceRoot);
  } catch (e) {
    output.appendLine('Warning: build failed: ' + String(e));
  }

  return true;
}
