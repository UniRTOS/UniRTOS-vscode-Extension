import * as vscode from 'vscode';
import { CommandsViewProvider, CommandItem } from './views/commandsView';
import { registerRunCommand } from './commands/runCommand';

export function activate(context: vscode.ExtensionContext) {
  const provider = new CommandsViewProvider();
  const treeView = vscode.window.createTreeView('unirtos.commands', ({ treeDataProvider: provider, canSelectMany: true } as any));
  context.subscriptions.push(treeView);

  context.subscriptions.push(vscode.commands.registerCommand('unirtos.refreshCommands', () => provider.refresh()));

  registerRunCommand(context, treeView as any);
}

export function deactivate() {}
