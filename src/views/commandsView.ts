import * as vscode from 'vscode';

export class CommandItem extends vscode.TreeItem {
  constructor(public readonly label: string, collapsibleState?: vscode.TreeItemCollapsibleState, public readonly isGroup: boolean = false) {
    super(label, collapsibleState ?? vscode.TreeItemCollapsibleState.None);
    if (!isGroup) {
      this.command = {
        command: 'unirtos.runCommand',
        title: 'Run Command',
        arguments: [this]
      };
    }
    this.contextValue = isGroup ? 'unirtosGroup' : 'unirtosCommand';
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
    if (!element) {
      // root: return two group nodes
      const groups = [
        new CommandItem('Commands', vscode.TreeItemCollapsibleState.Expanded, true),
        new CommandItem('Links', vscode.TreeItemCollapsibleState.Expanded, true)
      ];
      return Promise.resolve(groups);
    }

    // children for each group
    if (element.label === 'Commands') {
      const cmds = [
        new CommandItem('Guide - How to'),
        new CommandItem('Check Requirements'),
        new CommandItem('New Project'),
        new CommandItem('New Project From Demo'),
        new CommandItem('Open UniRTOS Project'),
        new CommandItem('Flash UniRTOS Firmware'),
        new CommandItem('Debug UniRTOS Logs')
      ];
      return Promise.resolve(cmds);
    }

    if (element.label === 'Links') {
      const links = [
        new CommandItem('UniRTOS github'),
        new CommandItem('UniRTOS Forum')
      ];
      return Promise.resolve(links);
    }

    return Promise.resolve([]);
  }
}
