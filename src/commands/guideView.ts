import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function showGuide(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'unirtosGuide',
    'UniRTOS — Quick Guide',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)]
    }
  );

  const file = path.join(context.extensionPath, 'src', 'webview', 'guide.html');
  let html = '<p>Guide not found</p>';
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error('Failed to read guide.html', e);
  }

  panel.webview.html = html;
}

export default showGuide;
