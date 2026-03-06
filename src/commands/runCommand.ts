import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CommandItem } from '../views/commandsView';

export function registerRunCommand(context: vscode.ExtensionContext, treeView: vscode.TreeView<CommandItem>) {
  // load platforms JSON
  const platformFile = path.join(context.extensionPath, 'src', 'data', 'platform.json');
  let platforms: Record<string, any> = {};
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

export async function handleNewProject(labelsArr: string[], platforms: Record<string, any>): Promise<boolean> {
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

  // support platforms where variants are either an array or an object mapping
  const variantsRaw = platforms[pickedModelKey];
  let variants: string[] = [];
  if (Array.isArray(variantsRaw)) {
    variants = variantsRaw;
  } else if (variantsRaw && typeof variantsRaw === 'object') {
    variants = Object.keys(variantsRaw as Record<string, unknown>);
  }

  let pickedVariant: string | undefined;
  if (variants.length > 0) {
    const chosen = await vscode.window.showQuickPick(variants, { placeHolder: `Select variant for ${pickedModelKey}` } as any);
    if (!chosen) {
      vscode.window.showInformationMessage('New Project cancelled');
      return true;
    }
    pickedVariant = Array.isArray(chosen) ? chosen[0] : chosen;
  }

  // attempt to get a URL/value for the chosen variant when variants are provided as a mapping
  let variantUrl: string | undefined;
  if (variantsRaw && typeof variantsRaw === 'object' && !Array.isArray(variantsRaw) && pickedVariant) {
    variantUrl = (variantsRaw as Record<string, unknown>)[pickedVariant] as string | undefined;
  }

  const msg = pickedVariant
    ? variantUrl
      ? `Selected: ${pickedModelKey} / ${pickedVariant} — ${variantUrl}`
      : `Selected: ${pickedModelKey} / ${pickedVariant}`
    : `Selected: ${pickedModelKey}`;
  console.log(msg);
  vscode.window.showInformationMessage(msg);

  return true;
}
