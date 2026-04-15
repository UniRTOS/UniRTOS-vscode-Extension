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

  // inject header fragment if available (uses <div id="header-root"></div> in HTML)
  try {
    const headerFile = path.join(context.extensionPath, 'src', 'webview', 'header.html');
    const headerHtml = fs.readFileSync(headerFile, 'utf8');
    html = html.replace('<div id="header-root"></div>', headerHtml);
  } catch (e) {
    console.warn('Header fragment not injected into guide.html:', e);
  }

  // Inject icon path into header placeholder using webview URI
  try {
    const iconFile = path.join(context.extensionPath, 'images', 'icon.png');
    if (fs.existsSync(iconFile)) {
      const uri = vscode.Uri.file(iconFile);
      const asWebview = (panel.webview as any).asWebviewUri;
      const iconUriObj = typeof asWebview === 'function' ? asWebview.call(panel.webview, uri) : uri;
      html = html.replace('%%UNIRTOS_ICON%%', iconUriObj ? iconUriObj.toString() : '');
    } else {
      html = html.replace('%%UNIRTOS_ICON%%', '');
    }
  } catch (e) {
    html = html.replace('%%UNIRTOS_ICON%%', '');
  }

  panel.webview.html = html;
}

export default showGuide;
