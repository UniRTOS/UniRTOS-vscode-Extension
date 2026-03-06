import * as vscode from 'vscode';

export class CommandItem extends vscode.TreeItem {
  constructor(public readonly label: string) {
    super(label);
    this.command = {
      command: 'unirtos.runCommand',
      title: 'Run Command',
      arguments: [this]
    };
    this.contextValue = 'unirtosCommand';
  }
}

export class CommandsViewProvider implements vscode.TreeDataProvider<CommandItem> {
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
      new CommandItem('Guide - How to'),
      new CommandItem('New Project'),
      new CommandItem('Open Project'),
      new CommandItem('Build Firmware')
    ];
    return Promise.resolve(items);
  }
}
