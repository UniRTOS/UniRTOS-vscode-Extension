import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { chooseDirectoryAndSet } from './cloneSdk';
import { runUnirtosCli } from './pythonCli';
import {
  getPlatforms,
  sendPlatforms,
  handlePlatformChanged,
  setupWebviewTheme,
  readConfigFile,
  writeConfigFile,
  openWorkspaceOrFolder,
  switchRepositorySource
} from '../utils';
import { runBasicEnvChecks } from './checkView';
import { injectHeaderIntoHtml } from './header';

let newProjectDemoPanel: vscode.WebviewPanel | undefined;

/**
 * Fetch demo projects from the Python CLI or fallback to bundled JSON,
 * then inject them into HTML as a script variable.
 * Returns the updated HTML.
 */
function injectDemoProjectsScript(context: vscode.ExtensionContext, html: string): string {
  try {
    let projects: Array<{ id: string; name: string; versions: string[] }> = [];
    try {
      const out = runUnirtosCli(['ls-demos']);
      if (out && out.length > 0) {
        // parse lines after "Remote demos:" and extract demo ids and versions
        const lines = out.split(/\r?\n/);
        let started = false;
        for (const l of lines) {
          const line = l.trim();
          if (!started) {
            if (/^Remote demos:/i.test(line)) {
              started = true;
            }
            continue;
          }
          if (line.length === 0) continue;
          const m = line.match(/^([^:\s]+)\s*:\s*(.+)$/);
          if (m) {
            const id = m[1];
            const versionsStr = m[2];
            // Split versions by comma and trim whitespace
            const versions = versionsStr.split(',').map(v => v.trim()).filter(v => v.length > 0);
            projects.push({ id, name: id, versions });
          }
        }
      }
    } catch (err) {
      // CLI failed — fallback to bundled JSON
        console.warn('Failed to load demo projects fallback:', err);
    }

    const projectsScript = `<script>window.__demoProjects = ${JSON.stringify(projects)};</script>`;
    return html.replace('<!--PROJECTS_SCRIPT-->', projectsScript);
  } catch (e) {
    console.warn('Failed to inject demo projects:', e);
    return html.replace('<!--PROJECTS_SCRIPT-->', '');
  }
}

export async function showNewProjectDemo(context: vscode.ExtensionContext) {
  // Use 1 tab only, not multiple ones
  const basic = runBasicEnvChecks(context, true);
  if (!basic.configPassed) {
    vscode.window.showErrorMessage((basic.reason || 'unknown') + ' Environment checks failed.');
    return false;
  }

  if (newProjectDemoPanel) {
    newProjectDemoPanel.reveal(vscode.ViewColumn.One);
  
    try { setupWebviewTheme(newProjectDemoPanel); } catch (e) {}
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

  // Inject demo projects from the Python CLI so the webview can populate the dropdown
  html = injectDemoProjectsScript(context, html);

  panel.webview.html = html;

  try { setupWebviewTheme(panel); } catch (e) { /* ignore if helper missing */ }

  // read platforms config and expose platforms list
  const platforms = getPlatforms(context) || {};
  const platformKeys = Object.keys(platforms);

  // attempt to read CONFIG_FILE module from the current workspace (if any)
  let defaultModule: string | undefined;
  const config = readConfigFile();
  if (config && typeof config.pickedModule === 'string' && config.pickedModule.trim().length > 0) {
    defaultModule = config.pickedModule.trim();
  }

  panel.webview.onDidReceiveMessage(async (message) => {
    if (!message || !message.type) return;
    if (message.type === 'repositorySourceChanged') {
      await switchRepositorySource(context, message.repositorySource);
      return;
    }

    if (message.type === 'ready') {
      const mirrorSource = vscode.workspace.getConfiguration('unirtos').get<string>('mirrorSource', 'github');
      panel.webview.postMessage({ type: 'setRepositorySource', repositorySource: mirrorSource });

      sendPlatforms(panel.webview, platformKeys);
      // If there's only one platform, pre-send its modules so the webview can populate `module` without a platform selector
      try {
        if (platformKeys.length === 1) {
          handlePlatformChanged(platformKeys[0], platforms, panel.webview);
        }
      } catch (e) { /* ignore */ }
      // if we detected a default module in the workspace, send it so the webview can pre-select
      if (defaultModule) {
        try { panel.webview.postMessage({ type: 'setModuleValue', value: defaultModule }); } catch (e) {}
      }
      // Ensure theme is applied when webview is ready
      try { setupWebviewTheme(panel); } catch (e) { /* ignore */ }
      return;
    }

    if (message.type === 'chooseDir') {
      await chooseDirectoryAndSet(panel.webview, 'Choose folder', 'value');
      return;
    }

    if (message.type === 'cancel') {
      try { panel.dispose(); } catch (e) { /* ignore */ }
      return;
    }

    if (message.type === 'platformChanged') {
      handlePlatformChanged(message.value, platforms, panel.webview);
      // after posting modules, ask webview to select the workspace module if available
      if (defaultModule) {
        try { panel.webview.postMessage({ type: 'setModuleValue', value: defaultModule }); } catch (e) {}
      }
      return;
    }

    // fallback to demo message handler
    if (message.type === 'createDemo') {
      const payload = message.payload || {};
      if ('targetDir' in payload) {
        await handleCreateDemoWithTarget(message, context, panel); // create new project
      } else {
        await handleCreateDemoMessage(message, context); // use current project
      }
    }
  });
}

// Returns the full path to the folder, or undefined if none found.
function findProjectFolder(dirPath: string): string | undefined {
  try {
    if (!fs.existsSync(dirPath)) {
      return undefined;
    }
    
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const folders = entries.filter(e => e.isDirectory());
    
    if (folders.length === 0) {
      return undefined;
    }
    
    let newestFolder = folders[0];
    let newestTime = fs.statSync(path.join(dirPath, newestFolder.name)).mtimeMs;
    
    for (let i = 1; i < folders.length; i++) {
      const folderPath = path.join(dirPath, folders[i].name);
      const stats = fs.statSync(folderPath);
      if (stats.mtimeMs > newestTime) {
        newestTime = stats.mtimeMs;
        newestFolder = folders[i];
      }
    }
    
    return path.join(dirPath, newestFolder.name);
  } catch (e) {
    console.warn('Failed to find project folder:', e);
    return undefined;
  }
}

// create demo project, inside current workspace
async function handleCreateDemoMessage(message: any, context: vscode.ExtensionContext) {
  const projectConfigPassed = runBasicEnvChecks(context, true);
  if (!projectConfigPassed.configPassed) {
    vscode.window.showErrorMessage(`${projectConfigPassed.reason}, cannot create demo project.`);
    return;
  }

  const payload = message.payload || {};
  const projectName = (payload.name || '').toString().trim();
  const version = (payload.version || '').toString().trim();

  if (!projectName) {
    vscode.window.showErrorMessage('Please select a demo project.');
    return;
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage('Please open a workspace folder before creating a demo project.');
    return;
  }

  try {
    const workspaceRoot = folders[0].uri.fsPath;
    const args = ['new', '-r', projectName];
    if (version) {
      args.push('-v', version);
    }
    args.push('-d', workspaceRoot);
    
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Creating demo project: ${projectName}`,
      cancellable: false
    }, async () => {
      runUnirtosCli(args);
    });

    vscode.window.showInformationMessage(`Demo project '${projectName}' created successfully.`);
  } catch (e: any) {
    vscode.window.showErrorMessage('Failed to create demo project: ' + (e && e.message ? e.message : e));
    console.error('Failed to create demo project', e);
  }
}

async function handleCreateDemoWithTarget(message: any, context: vscode.ExtensionContext, panel: vscode.WebviewPanel) {
  if (!message || !message.payload) return;
  const payload = message.payload || {};
  const projectName = (payload.name || '').toString().trim();
  const targetDir = (payload.targetDir || '').toString().trim();
  const version = (payload.version || '').toString().trim();

  if (!projectName) {
    vscode.window.showErrorMessage('Please select a demo project.');
    return;
  }

  if (!targetDir) {
    vscode.window.showErrorMessage('Please choose a location where the project should be created.');
    return;
  }

  try {
    const args = ['new', '-r', projectName];
    if (version) {
      args.push('-v', version);
    }
    args.push('-d', targetDir);
    
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Creating demo project: ${projectName}`,
      cancellable: false
    }, async () => {
      runUnirtosCli(args);
    });

    vscode.window.showInformationMessage(`Demo project '${projectName}' created successfully.`);

    // update project config: write to a folder named <projectName>-<version> under the selected targetDir
    const configFolder = version ? path.join(targetDir, `${projectName}-${version}`) : path.join(targetDir, projectName);
    writeConfigFile(configFolder, { pickedModule: message.payload.module });
    runUnirtosCli(['env-setup', '-d', configFolder]); // run env-setup command first
    
    // Find and open the newly created project folder
    panel.dispose();
    try {
      const projectFolder = findProjectFolder(targetDir);
      if (projectFolder) {
        await openWorkspaceOrFolder(projectFolder);
        
      }
    } catch (e) {
      console.warn('Failed to open created project folder:', e);
    }
  } catch (e: any) {
    vscode.window.showErrorMessage('Failed to create demo project: ' + (e && e.message ? e.message : e));
    console.error('Failed to create demo project', e);
  }
}
