import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
// import { projectConfigPassed, showCheckRequirements } from './checkView';
import { platformFilePath, sendPlatforms, handlePlatformChanged, writeAppJsonToFolder } from '../utils';
import { runBasicEnvChecks } from './checkView';
import { injectHeaderIntoHtml } from './header';

let newProjectDemoPanel: vscode.WebviewPanel | undefined;

export async function showNewProjectDemo(context: vscode.ExtensionContext) {
  // If global checks have not passed, disable this page and offer to open checks
  // if (!projectConfigPassed) {
  //   const choice = await vscode.window.showWarningMessage(
  //     'Environment checks have not passed — New Project (Demo) is disabled.',
  //     { modal: true },
  //     'Open Checks'
  //   );
  //   if (choice === 'Open Checks') {
  //     showCheckRequirements(context);
  //   }
  //   return;
  // }

  // Use 1 tab only, not multiple ones
  if (newProjectDemoPanel) {
    newProjectDemoPanel.reveal(vscode.ViewColumn.One);
    const basicExisting = runBasicEnvChecks(context);
    const passedExisting = basicExisting.gitFound && basicExisting.unirtosFound && basicExisting.pythonOk && basicExisting.workspaceOk;
    try { newProjectDemoPanel.webview.postMessage({ type: 'setUniRTOSProject', value: passedExisting }); } catch (e) {}
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'unirtosNewProjectDemo',
    'UniRTOS — New Project (Demo)',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(context.extensionPath)]
    }
  );
  newProjectDemoPanel = panel;
  panel.onDidDispose(() => { newProjectDemoPanel = undefined; });

  // Inject html
  const file = path.join(context.extensionPath, 'src', 'webview', 'new-project-demo.html');
  let html = '<p>Demo page not found</p>';
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error('Failed to read new-project-demo.html', e);
  }

  // inject header
  html = injectHeaderIntoHtml(html, panel, context, 'New Project From Demo');

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

  // check if project is unirtos
  const basic = runBasicEnvChecks(context);
  const gitFound = basic.gitFound;
  const unirtosFound = basic.unirtosFound;

  const pythonOk = basic.pythonOk; // 3. python check
  const workspaceOk = basic.workspaceOk; // 4. check if current workspace is UniRTOS SDK

  let projectConfigPassed = gitFound && unirtosFound && pythonOk && workspaceOk;
  if (projectConfigPassed) {
    panel.webview.postMessage({ type: 'setUniRTOSProject', value: true });
  }

  // read platforms config and expose platforms list
  const platforms = platformFilePath(context) || {};
  const platformKeys = Object.keys(platforms);

  panel.webview.onDidReceiveMessage((message) => {
    if (!message || !message.type) return;
    if (message.type === 'ready') {
      sendPlatforms(panel.webview, platformKeys);
      return;
    }

    if (message.type === 'platformChanged') {
      handlePlatformChanged(message.value, platforms, panel.webview);
      return;
    }

    // fallback to demo message handler
    handleCreateDemoMessage(message, context);
  });
}

function removeUnirtosPrefix(dest: string, workspaceRoot: string, id: string): string {
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
    console.warn('Failed to rename cloned folder:', e);
  }
  return finalDest;
}

/**
 * Append `text` to the bottom of `targetPath`.
 * Creates parent directories and the file when needed.
 * Returns true if text was added, false on error.
 */
function appendTextToFileBottom(targetPath: string, text: string): boolean {
  try {
    if (fs.existsSync(targetPath)) {
      const cur = fs.readFileSync(targetPath, 'utf8');
      fs.writeFileSync(targetPath, cur + '\n' + text, 'utf8');
    } else {
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Failed to append text to file:', e);
    return false;
  }
}

/**
 * Replace first match of `search` (RegExp) in file with `replacement`.
 * If file doesn't exist, the function will create it with `replacement`.
 * Returns true when replacement (or creation) occurred, false on error or when nothing changed.
 */
function replaceTextInFile(targetPath: string, search: RegExp, replacement: string): boolean {
  try {
    const cur = fs.readFileSync(targetPath, 'utf8');
    const updated = cur.replace(search, replacement);
    fs.writeFileSync(targetPath, updated, 'utf8');
    return true;
  } catch (e) {
    console.warn('Failed to replace text in file:', e);
    return false;
  }
}

/**
 * Update several SDK files by appending provided blocks when missing.
 * Returns true on success, false on any step failure.
 */
function updateSdkFiles(workspaceRoot: string, demoEntry?: any): boolean {
  try {
    // step 4: Kconfig
    let filePath = path.join(workspaceRoot, 'qos_applications', 'apps', 'Kconfig');
    let block = demoEntry.config.Kconfig;
    if (!appendTextToFileBottom(filePath, block)) return false;

    // step 5: CMakeLists
    filePath = path.join(workspaceRoot, 'qos_applications', 'apps', 'CMakeLists.txt');
    block = demoEntry.config.CMakeLists;
    if (!appendTextToFileBottom(filePath, block)) return false;

    // step 6: quecos_apps_config
    filePath = path.join(workspaceRoot, 'qos_applications', 'apps', 'include', 'unirtos_apps_config.h.in');
    block = demoEntry.config.quecos_apps_config;
    if (!appendTextToFileBottom(filePath, block)) return false;

    // step 7: apps_init.c — replace existing apps_init
    filePath = path.join(workspaceRoot, 'qos_applications', 'apps', 'app_init', 'apps_init.c');
    block = demoEntry.config.apps_init;
    const fnRegex = /void\s+apps_init\s*\(\s*void\s*\)\s*\{[\s\S]*?\}/m;
    const replaced = replaceTextInFile(filePath, fnRegex, block);
    if (!replaced) {
      if (!appendTextToFileBottom(filePath, '\n' + block)) return false;
    }

    // step 8: target.config
    filePath = path.join(workspaceRoot, 'target.config');
    block = demoEntry.config.target;
    if (!appendTextToFileBottom(filePath, block)) return false;

    // step 9: show_view.cmake
    filePath = path.join(workspaceRoot, 'show_view.cmake');
    block = demoEntry.config.show_view;
    if (!appendTextToFileBottom(filePath, block)) return false;

    return true;
  } catch (e) {
    console.warn('updateSdkFiles failed:', e);
    return false;
  }
}

/**
 * Run the top-level build script `buildlib_unirtos.bat` and stream output to an OutputChannel.
 * Returns true on success, false on failure.
 */

async function handleCreateDemoMessage(message: any, context: vscode.ExtensionContext) {
  if (!message || message.type !== 'createDemo') {
    return;
  }

  const payload = message.payload || {};
  const id = payload.name;

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage('Please open a workspace folder before creating a demo project.');
    return;
  }

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

    // check workspace + sdk folder
    let workspaceRoot = folders[0].uri.fsPath;
    // Look for qos_applications/apps at workspace root first, then one level deeper.
    let sdkRoot = workspaceRoot;
    let sdkApps = path.join(sdkRoot, 'qos_applications', 'apps');
    if (!fs.existsSync(sdkApps)) {
      try {
        const entries = fs.readdirSync(workspaceRoot);
        for (const e of entries) {
          const candidate = path.join(workspaceRoot, e);
          try {
            const candidateApps = path.join(candidate, 'qos_applications', 'apps');
            if (fs.statSync(candidate).isDirectory() && fs.existsSync(candidateApps)) {
              sdkRoot = candidate;
              sdkApps = candidateApps;
              vscode.window.showInformationMessage(`Detected SDK under ${sdkRoot}`);
              break;
            }
          } catch (err) {
            // ignore entry errors
          }
        }
      } catch (e) {
        // ignore read errors
      }
    }

    if (!fs.existsSync(sdkApps)) {
      vscode.window.showErrorMessage('SDK folder does not exist.');
      return;
    }

    // Update workspaceRoot to the detected SDK root so downstream operations use correct base
    workspaceRoot = sdkRoot;

    // Destination: <workspaceRoot>/qos_applications/apps/<id>
    let dest = path.join(workspaceRoot, 'qos_applications', 'apps', id);
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

    const finalDest = removeUnirtosPrefix(dest, workspaceRoot, id);

    if (finalDest == dest){
      vscode.window.showErrorMessage('Failed to update project name');
      return;
    }

    vscode.window.showInformationMessage(`Cloned demo project '${id}' to ${finalDest}`);

    // Update sdk files
    try {
      const ok = updateSdkFiles(workspaceRoot, entry);
      if (!ok) {
        vscode.window.showWarningMessage('Failed to update SDK files.');
        return;
      }
    } catch (e) {
      vscode.window.showWarningMessage('Failed to update SDK files.');
      console.warn('Failed to update SDK files:', e);
      return;
    }

    // create an app.json manifest inside the demo project folder
    const appManifest: any = {
      id: id,
      name: (entry && entry.name) ? entry.name : id,
      demo: true,
      createdBy: 'unirtos-extension'
    };
    const createAppFile = writeAppJsonToFolder(workspaceRoot, appManifest);
    if (!createAppFile) {
      vscode.window.showWarningMessage('Failed to write app config file.');
      return;
    }
    
    vscode.window.showInformationMessage('Demo project created successfully.');
  } catch (e: any) {
    vscode.window.showErrorMessage('Failed to clone demo project: ' + (e && e.message ? e.message : e));
    console.error('Failed to clone demo project', e);
  }
}
