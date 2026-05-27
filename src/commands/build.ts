import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { platformFilePath } from '../utils';
import { runBasicEnvChecks } from './checkView';

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
  // Get available platforms and collect all sub-keys
  const platforms = platformFilePath(context);
  const platformKeys = Object.keys(platforms);

  if (platformKeys.length === 0) {
    vscode.window.showErrorMessage('No platforms found. Please check your configuration.');
    return false;
  }

  // Collect all sub-keys from all platforms
  const subKeys: string[] = [];
  for (const platformKey of platformKeys) {
    const platform = platforms[platformKey];
    if (platform && typeof platform === 'object') {
      const keys = Object.keys(platform);
      subKeys.push(...keys);
    }
  }

  if (subKeys.length === 0) {
    vscode.window.showErrorMessage('No devices found. Please check your configuration.');
    return false;
  }

  // Try to read selected device from app.json "model" property in workspace root
  let selectedDevice: string | undefined;
  let version: string | undefined;
  try {
    const appJsonPath = path.join(workspaceRoot, 'app.json');
    if (fs.existsSync(appJsonPath)) {
      const content = fs.readFileSync(appJsonPath, 'utf8');
      const appJson = JSON.parse(content);
      if (appJson && typeof appJson.model === 'string') {
        if (subKeys.includes(appJson.model)) {
          selectedDevice = appJson.model;
          version = appJson.version || `${selectedDevice}_R01A01_BETA_OCPU_2026`;
        } else {
          vscode.window.showWarningMessage(`Device "${appJson.model}" from app.json not found in platform list.`);
        }
      }
    }
  } catch (e) {
    console.warn('Failed to read app.json:', e);
  }

  // If no valid model found in app.json, ask the user
  if (!selectedDevice) {
    selectedDevice = await vscode.window.showQuickPick(
      subKeys,
      { placeHolder: 'Select a device' }
    );

    if (!selectedDevice) {
      vscode.window.showInformationMessage('Build skipped. You can build later using the Build command.');
      return false;
    }
  }

  // Ask user if they want to build the SDK for the selected device
  const buildChoice = await vscode.window.showInformationMessage(
    `Would you like to build the SDK for ${selectedDevice} now?\n\nNote:\nTo update the version name, please edit app.json and set the "version" field.`,
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

  // 2. run buildlib_unirtos script
  const script = 'unirtos make';
  const isWin = process.platform === 'win32';
  const cmd = isWin ? `cmd.exe /c ${script} ${selectedDevice} ${version}` : `./${script} ${selectedDevice} ${version}`;

  // console.log('Running build command:', cmd, 'in workspace:', workspaceRoot);
  // 3. print result from the script in output channel
  return await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Building SDK',
    cancellable: false
  }, async () => {
    return new Promise<boolean>((resolve) => {
      const child = exec(cmd, { cwd: workspaceRoot });

      if (child.stdout) child.stdout.on('data', (d) => output.append(d.toString()));
      if (child.stderr) child.stderr.on('data', (d) => output.append(d.toString()));

      child.on('error', (err) => {
        output.appendLine('Build process error: ' + err.message);
        resolve(false);
      });

      child.on('close', (code) => {
        if (code === 0) {
          output.appendLine('Build finished successfully.');
          resolve(true);
        } else {
          output.appendLine(`Build exited with code ${code}.`);
          resolve(false);
        }
      });
    });
  });
}
