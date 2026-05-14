import * as vscode from 'vscode';
import { exec } from 'child_process';
import { platformFilePath } from '../utils';

export async function runBuildScript(workspaceRoot: string, context: vscode.ExtensionContext): Promise<boolean> {
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
    if (platform && typeof platform === 'object' && platformKey == 'eigen_718') {
      const keys = Object.keys(platform);
      subKeys.push(...keys);
    }
  }

  if (subKeys.length === 0) {
    vscode.window.showErrorMessage('No devices found. Please check your configuration.');
    return false;
  }

  // Ask user to select a device
  const selectedDevice = await vscode.window.showQuickPick(
    subKeys,
    { placeHolder: 'Select a device' }
  );

  if (!selectedDevice) {
    vscode.window.showInformationMessage('Build skipped. You can build later using the Build command.');
    return false;
  }

  // Ask user if they want to build the SDK for the selected device
  const buildChoice = await vscode.window.showInformationMessage(
    `Would you like to build the SDK for ${selectedDevice} now?`,
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
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const version = `${selectedDevice}_${dateStr}`;
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
