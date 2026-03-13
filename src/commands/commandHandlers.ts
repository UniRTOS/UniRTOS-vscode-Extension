import * as vscode from 'vscode';
import { CommandItem } from '../views/commandsView';
import { showGuide } from './guideView';
import { showCheckRequirements } from './checkView';
import { handleNewProject } from './newProject';
import { showNewProjectDemo } from './newProjectDemo';

export function registerCommandHandlers(context: vscode.ExtensionContext, treeView: vscode.TreeView<CommandItem>) {

  context.subscriptions.push(vscode.commands.registerCommand('unirtos.runCommand', (item) => {
    (async () => {
      const selection = Array.isArray(item) ? item : (item ? [item] : treeView.selection);
      const labelsArr: string[] = (selection || []).map((s: CommandItem) => s.label);
      // route based on primary selection
      const primary = labelsArr[0] ?? '';
      switch (primary) {
        case 'Guide - How to':
          showGuide(context);
          return;
        case 'Check Requirements':
          showCheckRequirements(context);
          return;
        case 'New Project':
          await handleNewProject(labelsArr, context);
          return;
        case 'New Project From Demo':
          showNewProjectDemo(context);
          return;
        default:
          const labels = labelsArr.join(', ');
          vscode.window.showInformationMessage(`Running: ${labels || 'none'}`);
          break;
      }

      return;
    })();
  }));
}

