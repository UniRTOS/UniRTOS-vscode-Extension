import * as vscode from 'vscode';
import { runBasicEnvChecks } from './checkView';
import { runUnirtosCli, runCliCommandWithStreaming } from './pythonCli';

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

  // Ask user if they want to build the SDK for the selected device
  const buildChoice = await vscode.window.showInformationMessage(
    `Would you like to build the SDK now?\n\nNote:\nTo update the version name, please edit env_config.json and set the "build.version" field.`,
    { modal: true },
    'Yes'
  );

  if (buildChoice !== 'Yes') {
    vscode.window.showInformationMessage('Build skipped. You can build later using the Build command.');
    return false;
  }

  // 1. create output channel
  const output = vscode.window.createOutputChannel('UniRTOS Build');
  output.show();
  output.appendLine('Starting build process....');

  // 2. run env-setup command first
  try {
    const result = runUnirtosCli(['env-setup', '-d', workspaceRoot]);
    output.appendLine(result);
  } catch (e) {
    output.appendLine('Warning: env-setup failed: ' + String(e));
  }

  // 3. Run build command
  try {
    await runCliCommandWithStreaming(['build', '-d', workspaceRoot], output, workspaceRoot);
  } catch (e) {
    output.appendLine('Warning: build failed: ' + String(e));
  }

  return true;
}
