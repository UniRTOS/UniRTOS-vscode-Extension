import * as vscode from 'vscode';

export async function openSerialMonitor(context: vscode.ExtensionContext) {
  try {
    await vscode.commands.executeCommand('vscode-serial-monitor.monitor0.focus');
    vscode.window.showInformationMessage('Please connect to debug port and choose correct port');
    return;
  } catch (e) {
    vscode.window.showErrorMessage('Unable to open Serial Monitor. Ensure the "ms-vscode.vscode-serial-monitor" extension is installed.');
  }
}
