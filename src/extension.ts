import * as vscode from 'vscode';
import { CommandsViewProvider, CommandItem } from './views/commandsView';
import { registerCommandHandlers } from './commands/commandHandlers';

export function activate(context: vscode.ExtensionContext) {
  const provider = new CommandsViewProvider();
  const treeView = vscode.window.createTreeView('unirtos.commands', ({ treeDataProvider: provider, canSelectMany: true, showCollapseAll: true } as any));
  context.subscriptions.push(treeView);

  context.subscriptions.push(vscode.commands.registerCommand('unirtos.refreshCommands', () => provider.refresh()));

  registerCommandHandlers(context, treeView as any);
}

export function deactivate() {}
