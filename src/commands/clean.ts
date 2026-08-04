import * as vscode from 'vscode';
import { runBasicEnvChecks } from './checkView';
import { runUnirtosCli } from './pythonCli';

export async function runCleanScript(context: vscode.ExtensionContext): Promise<boolean> {
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
	const folders = vscode.workspace.workspaceFolders;
	
	if (!folders || folders.length === 0) {
		vscode.window.showErrorMessage('Please open a workspace folder before creating a demo project.');
		return false;
	}
	const workspaceRoot = folders[0].uri.fsPath;

	try {
		runUnirtosCli(['clean', '-d', workspaceRoot]);
		vscode.window.showInformationMessage('Build files removed successfully.');
		return true;
	} catch (e) {
		vscode.window.showErrorMessage('Failed to clean project: ' + String(e));
		return false;
	}
}
