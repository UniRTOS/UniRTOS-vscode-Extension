import * as vscode from 'vscode';

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

  const html = `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>UniRTOS Guide</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial; padding: 20px; color: #222 }
      h1 { color: #0066cc }
      pre { background:#f3f3f3; padding:10px; border-radius:4px; overflow:auto }
      a { color: #0066cc }
    </style>
  </head>
  <body>
    <h1>UniRTOS — Quick Start</h1>
    <p>This guide shows how to create a new project using the extension.</p>
    <h2>Steps</h2>
    <ol>
      <li>Open the <strong>Commands</strong> view from the UniRTOS activity bar.</li>
      <li>Click <em>New Project</em> and choose a platform and model.</li>
      <li>If available, choose a model SDK to clone — the extension can clone the repo for you.</li>
      <li>Open the cloned project and follow its README to build and flash.</li>
    </ol>
    <h2>Example CLI</h2>
    <pre>git clone &lt;repo_url&gt; &amp;&amp; cd &lt;repo&gt; &amp;&amp; make</pre>
    <p>For more information see the extension README or project documentation.</p>
  </body>
  </html>`;

  panel.webview.html = html;
}

export default showGuide;
