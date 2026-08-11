import * as vscode from 'vscode';
import { CommandItem } from '../views/commandsView';
import { handleNewProject } from './newProject';
import { showNewProjectDemo } from './newProjectDemo';
import { showFlashFirmware } from './flash/flashFirmware';
import { openSerialMonitor } from './debug';
import { runBuildScript } from './build';
import { runCleanScript } from './clean';
import { downloadAndInstall, downloadUnirtos } from './toolchainDownload';
import { QUECTEL_DRIVER_URL } from '../constants';
import path from 'path/win32';
import os from 'os';
import { initVenv, ensureVenv } from './pythonCli';
import { execSync, exec } from 'child_process';

export function registerCommandHandlers(context: vscode.ExtensionContext, treeView: vscode.TreeView<CommandItem>) {
  context.subscriptions.push(vscode.commands.registerCommand('unirtos.openWalkthrough', async () => {
    try {
      await vscode.commands.executeCommand('workbench.action.openWalkthrough', 'Quectel.unirtos#unirtosWalkthrough');
    } catch (error) {
      vscode.window.showErrorMessage('Unable to open the walkthrough.');
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('unirtos.installToolchainCommand', async () => {
    try {
      // Implement the installation logic here
      downloadUnirtos(context);
    } catch (error) {
      vscode.window.showErrorMessage('Failed to install UniRTOS toolchain.');
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('unirtos.installPythonCommand', async () => {
    try {
      await openUrlInIntegratedBrowser('https://www.python.org/downloads/');
    } catch (error) {
      vscode.window.showErrorMessage('Failed to open the URL.');
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('unirtos.installGitCommand', async () => {
    try {
      await openUrlInIntegratedBrowser('https://git-scm.com/install/');
    } catch (error) {
      vscode.window.showErrorMessage('Failed to open the URL.');
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('unirtos.installDriverCommand', async () => {
    try {
      downloadAndInstall(QUECTEL_DRIVER_URL, context, { defaultDir: path.join(os.tmpdir(), 'quectel-driver-downloads'), title: 'Downloading Quectel driver', installTitle: 'Installing Quectel driver', autoRunInstaller: false });
      
    } catch (error) {
      vscode.window.showErrorMessage('Failed to open the URL.');
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('unirtos.installCliCommand', async () => {
    try {
      vscode.window.showInformationMessage('Installing UniRTOS CLI...');

      let pythonExe = initVenv(context);
      execSync(`"${pythonExe}" -m pip install --upgrade pip unirtos_cli`, { stdio: 'pipe' });
      vscode.window.showInformationMessage('UniRTOS CLI installed successfully.');

    } catch (error) {
      vscode.window.showErrorMessage('Failed to install UniRTOS CLI.' + error);
    }
  }));

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
        case 'Welcome':
          try {
            await vscode.commands.executeCommand('workbench.action.openWalkthrough', 'Quectel.unirtos#unirtosWalkthrough');
          } catch (error) {
            vscode.window.showErrorMessage('Unable to open the walkthrough.');
          }
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
        case 'Build':
          await runBuildScript(vscode.workspace.workspaceFolders?.[0].uri.fsPath || '', context);
          return;
        case 'Clean':
          await runCleanScript(context);
          return;
        case 'Flash':
          showFlashFirmware(context);
          return;
        case 'Debug':
          await openSerialMonitor(context);
          return;
        // Links
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

