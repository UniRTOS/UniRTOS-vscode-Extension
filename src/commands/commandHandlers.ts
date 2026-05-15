import * as vscode from 'vscode';
import { CommandItem } from '../views/commandsView';
import { showGuide } from './guideView';
import { showCheckRequirements } from './checkView';
import { handleNewProject } from './newProject';
import { showNewProjectDemo } from './newProjectDemo';
import { showFlashFirmware } from './flashFirmware';
import { runBuildScript } from './build';

export function registerCommandHandlers(context: vscode.ExtensionContext, treeView: vscode.TreeView<CommandItem>) {

  // Open url using integrated browser or system browser
  async function openUrlInIntegratedBrowser(url: string) {
    try {
      await vscode.commands.executeCommand('workbench.action.browser.open', url);
    } catch (e) {
      try {
        await vscode.env.openExternal(vscode.Uri.parse(url));
      } catch (_) {
        vscode.window.showErrorMessage('Unable to open the URL. Please try again later.');
        
      }
    }
  }

  context.subscriptions.push(vscode.commands.registerCommand('unirtos.runCommand', (item) => {
    (async () => {
      const selection = Array.isArray(item) ? item : (item ? [item] : treeView.selection);
      const labelsArr: string[] = (selection || []).map((s: CommandItem) => s.label);
      // route based on primary selection
      const cmd = labelsArr[0] ?? '';
      switch (cmd) {
        case 'Guide - How to':
          showGuide(context);
          return;
        case 'Check Requirements':
          showCheckRequirements(context);
          return;
        case 'Build':
          await runBuildScript(vscode.workspace.workspaceFolders?.[0].uri.fsPath || '', context);
          return;
        case 'New Project':
          await handleNewProject(labelsArr, context);
          return;
        case 'New Project From Demo':
          showNewProjectDemo(context);
          return;
        case 'Open Existing Project':
          {
            const uris = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false });
            if (uris && uris.length > 0) {
              await vscode.commands.executeCommand('vscode.openFolder', uris[0], false);
            }
            return;
          }
          case 'Flash':
            showFlashFirmware(context);
            return;
          case 'Github':
              await openUrlInIntegratedBrowser('https://github.com/UniRTOS');
              return;
          case 'Forum':
              await openUrlInIntegratedBrowser('https://forums.quectel.com/categories');
              return;
          case 'Offical Website':
              await openUrlInIntegratedBrowser('https://www.quectel.com.cn/unirtos/unirtos');
              return;
          case 'Document Center':
              await openUrlInIntegratedBrowser('https://www.quectel.com.cn/unirtos/software');
              return;
          default:
          const labels = labelsArr.join(', ');
          vscode.window.showInformationMessage(`Coming soon: ${labels || 'none'}`);
          break;
      }

      return;
    })();
  }));
}

