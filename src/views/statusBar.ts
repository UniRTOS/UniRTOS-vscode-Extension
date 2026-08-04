import * as vscode from 'vscode';
import { runBuildScript } from '../commands/build';
import { runCleanScript } from '../commands/clean';
import { showFlashFirmware } from '../commands/flash/flashFirmware';
import { getPlatforms, readConfigFile, writeConfigFile } from '../utils';

const STATUS_BAR_MODULE_COMMAND = 'unirtos.statusBarModule';
const STATUS_BAR_FLASH_COMMAND = 'unirtos.statusBarFlash';
const STATUS_BAR_BUILD_COMMAND = 'unirtos.statusBarBuild';
const STATUS_BAR_CLEAN_COMMAND = 'unirtos.statusBarClean';

function registerModuleStatusBarItem(context: vscode.ExtensionContext): void {
	const moduleStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 103);
	const updateModuleStatusBarItem = () => {
		const config = readConfigFile();
		const moduleName = config?.build?.module;
		const moduleText = (typeof moduleName === 'string' && moduleName.trim().length > 0) ? moduleName.trim() : '';
		moduleStatusBarItem.text = `${moduleText}`;
		moduleStatusBarItem.tooltip = `Current unirtos module: ${moduleText}`;
	};

	// when module icon pushed, user can change the module
	context.subscriptions.push(
		vscode.commands.registerCommand(STATUS_BAR_MODULE_COMMAND, async () => {
			const platforms = getPlatforms(context);
			const firstPlatformEntry = Object.entries(platforms)[0];
			const moduleItems = (firstPlatformEntry?.[1] && typeof firstPlatformEntry[1] === 'object' && !Array.isArray(firstPlatformEntry[1]))
				? Object.keys(firstPlatformEntry[1] as Record<string, unknown>)
					.sort((left, right) => left.localeCompare(right))
					.map((moduleName) => ({ label: moduleName }))
				: [];

			if (moduleItems.length === 0) {
				await vscode.window.showInformationMessage('No modules available');
				return;
			}

			const selected = await vscode.window.showQuickPick(moduleItems, { placeHolder: 'Update Module' });
			if (selected) {
				const workspaceFolders = vscode.workspace.workspaceFolders;
				if (!workspaceFolders || workspaceFolders.length === 0) return;
				writeConfigFile(workspaceFolders[0].uri.fsPath, { pickedModule: selected.label }); // update config file
				updateModuleStatusBarItem();
				vscode.window.showInformationMessage(`Module updated: ${selected.label}`);
			}
			else{
				vscode.window.showInformationMessage('Module update canceled');
			}
		})
	);

	moduleStatusBarItem.command = STATUS_BAR_MODULE_COMMAND;
	updateModuleStatusBarItem();
	moduleStatusBarItem.show();

	context.subscriptions.push(moduleStatusBarItem);
}

export function registerStatusBarItems(context: vscode.ExtensionContext): void {
	registerModuleStatusBarItem(context); // module icon

    // flash icon
	context.subscriptions.push(
		vscode.commands.registerCommand(STATUS_BAR_FLASH_COMMAND, async () => {
			await showFlashFirmware(context);
		})
	);

	const flashStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 102);
	flashStatusBarItem.text = '$(zap)';
	flashStatusBarItem.tooltip = 'Flash UniRTOS firmware';
	flashStatusBarItem.command = STATUS_BAR_FLASH_COMMAND;
	flashStatusBarItem.show();

	context.subscriptions.push(flashStatusBarItem);

    // build icon
	context.subscriptions.push(
		vscode.commands.registerCommand(STATUS_BAR_BUILD_COMMAND, async () => {
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
			await runBuildScript(workspaceRoot, context);
		})
	);

	const buildStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
	buildStatusBarItem.text = '$(tools)';
	buildStatusBarItem.tooltip = 'Build UniRTOS project';
	buildStatusBarItem.command = STATUS_BAR_BUILD_COMMAND;
	buildStatusBarItem.show();

	context.subscriptions.push(buildStatusBarItem);

    // clean icon
	context.subscriptions.push(
		vscode.commands.registerCommand(STATUS_BAR_CLEAN_COMMAND, async () => {
			await runCleanScript(context);
		})
	);

	const cleanStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	cleanStatusBarItem.text = '$(trash)';
	cleanStatusBarItem.tooltip = 'Clean UniRTOS build files';
	cleanStatusBarItem.command = STATUS_BAR_CLEAN_COMMAND;
	cleanStatusBarItem.show();

	context.subscriptions.push(cleanStatusBarItem);
}
