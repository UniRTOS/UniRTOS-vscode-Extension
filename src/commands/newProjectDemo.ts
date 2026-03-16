import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';

export function showNewProjectDemo(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'unirtosNewProjectDemo',
    'UniRTOS — New Project (Demo)',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)]
    }
  );

  const file = path.join(context.extensionPath, 'src', 'webview', 'new-project-demo.html');
  let html = '<p>Demo page not found</p>';
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error('Failed to read new-project-demo.html', e);
  }

  // Inject header fragment server-side to avoid webview fetch/403 issues
  try {
    const headerFile = path.join(context.extensionPath, 'src', 'webview', 'header.html');
    const headerHtml = fs.readFileSync(headerFile, 'utf8');
    html = html.replace('<div id="header-root"></div>', headerHtml);
  } catch (e) {
    console.warn('Header fragment not injected:', e);
  }

  // Inject demo projects from JSON so the webview can populate the dropdown
  try {
    const demoFile = path.join(context.extensionPath, 'src', 'data', 'demo-projects.json');
    const demoRaw = fs.readFileSync(demoFile, 'utf8');
    const demoObj = JSON.parse(demoRaw || '{}');
    const projects = Object.keys(demoObj).map(k => ({ id: k, name: (demoObj[k] && demoObj[k].name) || k }));
    const projectsScript = `<script>window.__demoProjects = ${JSON.stringify(projects)};</script>`;
    html = html.replace('<!--PROJECTS_SCRIPT-->', projectsScript);
  } catch (e) {
    console.warn('Failed to inject demo projects:', e);
    html = html.replace('<!--PROJECTS_SCRIPT-->', '');
  }

  panel.webview.html = html;

  // Handle messages from the webview (create demo action)
  panel.webview.onDidReceiveMessage(async (message) => {
    if (!message || message.type !== 'createDemo') {
      return;
    }

    const payload = message.payload || {};
    const id = payload.name;
    const addToSdk = !!payload.addToSdk;

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showErrorMessage('Please open a workspace folder before creating a demo project.');
      return;
    }

    const workspaceRoot = folders[0].uri.fsPath;

    // Read demo-projects.json to get repo URL
    try {
      const demoFile = path.join(context.extensionPath, 'src', 'data', 'demo-projects.json');
      const demoRaw = fs.readFileSync(demoFile, 'utf8');
      const demoObj = JSON.parse(demoRaw || '{}');
      const entry = demoObj[id];
      const repo = entry && entry.repo ? entry.repo : '';

      if (!repo) {
        vscode.window.showErrorMessage('Demo project does not have a repository URL configured.');
        return;
      }

      // Destination: <workspaceRoot>/qos_applications/apps/<id>
      const dest = path.join(workspaceRoot, 'qos_applications', 'apps', id);

      if (fs.existsSync(dest)) {
        const choice = await vscode.window.showWarningMessage(
          `Destination ${dest} already exists. Overwrite?`,
          { modal: true },
          'Overwrite',
          'Cancel'
        );
        if (choice !== 'Overwrite') {
          vscode.window.showInformationMessage('Clone cancelled.');
          return;
        }
        try {
          fs.rmSync(dest, { recursive: true, force: true });
        } catch (e) {
          // fallthrough
        }
      }

      // Ensure parent exists
      fs.mkdirSync(path.dirname(dest), { recursive: true });

      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Cloning demo project',
        cancellable: false
      }, async () => {
        await new Promise<void>((resolve, reject) => {
          const cmd = `git clone ${repo} "${dest}"`;
          exec(cmd, { cwd: workspaceRoot }, (err, stdout, stderr) => {
            if (err) {
              reject(new Error(stderr || err.message));
              return;
            }
            resolve();
          });
        });
      });

      // Attempt to remove the `unirtos_` prefix from the folder name
      let finalDest = dest;
      try {
        const prefix = 'unirtos_';
        if (id && id.startsWith(prefix)) {
          const newId = id.substring(prefix.length);
          const newDest = path.join(workspaceRoot, 'qos_applications', 'apps', newId);
          if (newDest !== dest) {
            if (fs.existsSync(newDest)) {
              vscode.window.showWarningMessage(
                `Cannot rename cloned folder to '${newId}' because that destination already exists. Keeping original name.`
              );
            } else {
              fs.renameSync(dest, newDest);
              finalDest = newDest;
            }
          }
        }
      } catch (e) {
        // Non-fatal: continue and report the original destination
        console.warn('Failed to rename cloned folder:', e);
      }

      vscode.window.showInformationMessage(`Cloned demo project '${id}' to ${finalDest}`);

      if (addToSdk) {
        // Placeholder: user requested add to SDK — extension can react here.
        vscode.window.showInformationMessage('Requested to add demo project to current SDK (no-op).');
      }
    } catch (e: any) {
      vscode.window.showErrorMessage('Failed to clone demo project: ' + (e && e.message ? e.message : e));
      console.error('Failed to clone demo project', e);
    }
  });
}

export default showNewProjectDemo;
