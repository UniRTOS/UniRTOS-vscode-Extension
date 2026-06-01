import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

function escapeHtml(input: string): string {
  return input.replace(/[&"'<>]/g, (c) => ({ '&': '&amp;', '"': '&quot;', "'": '&#39;', '<': '&lt;', '>': '&gt;' } as any)[c]);
}

export function injectIconIntoHtml(html: string, panel: vscode.WebviewPanel, context: vscode.ExtensionContext): string {
  try {
    const iconFile = path.join(context.extensionPath, 'images', 'icon.png');
    if (fs.existsSync(iconFile)) {
      const uri = vscode.Uri.file(iconFile);
      const asWebview = (panel.webview as any).asWebviewUri;
      const iconUriObj = typeof asWebview === 'function' ? asWebview.call(panel.webview, uri) : uri;
      return html.replace('%%UNIRTOS_ICON%%', iconUriObj ? iconUriObj.toString() : '');
    }
    return html.replace('%%UNIRTOS_ICON%%', '');
  } catch (e) {
    return html.replace('%%UNIRTOS_ICON%%', '');
  }
}

export function injectHeaderIntoHtml(html: string, panel: vscode.WebviewPanel, context: vscode.ExtensionContext, pageTitle?: string): string {
  try {
    const headerFile = path.join(context.extensionPath, 'src', 'webview', 'header.html');
    let headerHtml = fs.readFileSync(headerFile, 'utf8');
    // Replace CSS placeholder with webview URI
    try {
      const cssFile = path.join(context.extensionPath, 'src', 'webview', 'common.css');
      if (fs.existsSync(cssFile)) {
        const cssUri = vscode.Uri.file(cssFile);
        const asWebview = (panel.webview as any).asWebviewUri;
        const cssUriObj = typeof asWebview === 'function' ? asWebview.call(panel.webview, cssUri) : cssUri;
        headerHtml = headerHtml.replace('%%HEADER_CSS%%', cssUriObj ? cssUriObj.toString() : '');
      } else {
        headerHtml = headerHtml.replace('%%HEADER_CSS%%', '');
      }
    } catch (e) {
      headerHtml = headerHtml.replace('%%HEADER_CSS%%', '');
    }
    if (pageTitle != null) {
      try {
        headerHtml = headerHtml.replace('id="page-title-value">—</strong>', `id="page-title-value">${escapeHtml(String(pageTitle))}</strong>`);
      } catch (e) {
        // ignore replace errors and continue
      }
    }
    html = html.replace('<div id="header-root"></div>', headerHtml);
    // Inject icon path into header placeholder using webview URI
    html = injectIconIntoHtml(html, panel, context);
    return html;
  } catch (e) {
    console.warn('Header fragment not injected into webview:', e);
    return html;
  }
}
