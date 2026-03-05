import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CommandItem } from '../views/commandsView';

export function registerRunCommand(context: vscode.ExtensionContext, treeView: vscode.TreeView<CommandItem>) {
  // load platforms JSON
  const platformFile = path.join(context.extensionPath, 'src', 'data', 'platform.json');
  let platforms: Record<string, string[]> = {};
  try {
    const raw = fs.readFileSync(platformFile, 'utf8');
    platforms = JSON.parse(raw);
  } catch (e) {
    platforms = {};
  }

  context.subscriptions.push(vscode.commands.registerCommand('unirtos.runCommand', (item) => {
    (async () => {
      const selection = Array.isArray(item) ? item : (item ? [item] : treeView.selection);
      const labelsArr: string[] = (selection || []).map((s: CommandItem) => s.label);
      if (await handleNewProject(labelsArr, platforms)) {
        return;
      }

      const labels = labelsArr.join(', ');
      vscode.window.showInformationMessage(`Running: ${labels || 'none'}`);
    })();
  }));
}

export async function handleNewProject(labelsArr: string[], platforms: Record<string, string[]>): Promise<boolean> {
  if (!labelsArr.includes('New Project')) return false;

  const models = Object.keys(platforms);
  if (models.length === 0) {
    vscode.window.showInformationMessage('No models available');
    return true;
  }

  const pickedModel = await vscode.window.showQuickPick(models, { placeHolder: 'Please choose model' } as any);
  if (!pickedModel) return true;

  const pickedModelKey = Array.isArray(pickedModel) ? pickedModel[0] : pickedModel;
  if (!pickedModelKey) return true;

  const variants = platforms[pickedModelKey] ?? [];
  if (variants.length === 0) {
    vscode.window.showInformationMessage(`No variants for ${pickedModelKey}`);
    return true;
  }

  const chosen = await vscode.window.showQuickPick(variants, { placeHolder: `Select variant for ${pickedModelKey}` } as any);
  if (chosen) {
    const picked = Array.isArray(chosen) ? chosen.join(', ') : chosen;
    vscode.window.showInformationMessage(`New Project: ${pickedModelKey}: ${picked}`);
  } else {
    vscode.window.showInformationMessage('New Project cancelled');
  }

  return true;
}
