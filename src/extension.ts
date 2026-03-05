import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  const commandsProvider = new CommandsViewProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('unirtos.commands', commandsProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('unirtos.refreshCommands', () => commandsProvider.refresh())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('unirtos.runCommand', (item: CommandItem) => {
      vscode.window.showInformationMessage(`Running: ${item ? item.label : 'unknown'}`);
    })
  );
}

class CommandsViewProvider implements vscode.TreeDataProvider<CommandItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<CommandItem | null | undefined> = new vscode.EventEmitter<CommandItem | null | undefined>();
  readonly onDidChangeTreeData: vscode.Event<CommandItem | null | undefined> = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: CommandItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: CommandItem): Thenable<CommandItem[]> {
    const items = [
      new CommandItem('New Project', 'newProject'),
      new CommandItem('Open Project', 'openProject'),
      new CommandItem('Build Firmware', 'buildFirmware')
    ];
    return Promise.resolve(items);
  }
}

class CommandItem extends vscode.TreeItem {
  constructor(label: string, commandId: string) {
    super(label);
    this.command = {
      command: 'unirtos.runCommand',
      title: 'Run Command',
      arguments: [this]
    };
    this.contextValue = 'unirtosCommand';
  }
}

export function deactivate() {}
