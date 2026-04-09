import * as vscode from 'vscode';
import { exec } from 'child_process';

export async function runBuildScript(workspaceRoot: string): Promise<boolean> {
  // Ask user if they want to build the SDK
  const buildChoice = await vscode.window.showInformationMessage(
    'Would you like to build the SDK now?',
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
  const script = 'buildlib_unirtos.bat';
  const isWin = process.platform === 'win32';
  const cmd = isWin ? `cmd.exe /c ${script}` : `./${script}`;

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
