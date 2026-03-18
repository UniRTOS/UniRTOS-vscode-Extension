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

  // Inject html + header files
  const file = path.join(context.extensionPath, 'src', 'webview', 'new-project-demo.html');
  let html = '<p>Demo page not found</p>';
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error('Failed to read new-project-demo.html', e);
  }
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
  panel.webview.onDidReceiveMessage((message) => handleCreateDemoMessage(message, context));
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
 * Append `text` to the bottom of `targetPath` if `uniqueCheck` isn't already present.
 * Creates parent directories and the file when needed.
 * Returns true if text was added, false if it already existed or on error.
 */
function appendTextToFileBottom(targetPath: string, text: string, uniqueCheck?: string): boolean {
  try {
    const check = uniqueCheck || text;
    if (fs.existsSync(targetPath)) {
      const cur = fs.readFileSync(targetPath, 'utf8');
      if (cur.includes(check)) {
        return false;
      }
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
function updateSdkFiles(workspaceRoot: string): boolean {
  try {
    // step 4: Kconfig
    let filePath = path.join(workspaceRoot, 'qos_applications', 'apps', 'Kconfig');
    let block = `\nconfig QAPP_HELLO_WORLD_DEMO_FUNC\n    bool "Enable hello world demo"\n    default n\n`;
    if (!appendTextToFileBottom(filePath, block, 'config QAPP_HELLO_WORLD_DEMO_FUNC')) return false;

    // step 5: CMakeLists
    filePath = path.join(workspaceRoot, 'qos_applications', 'apps', 'CMakeLists.txt');
    block = `\nif(CONFIG_QAPP_HELLO_WORLD_DEMO_FUNC)\n    add_subdirectory_if_exist(helloworld_demos)\nendif()\n`;
    if (!appendTextToFileBottom(filePath, block)) return false;

    // step 6: quecos_apps_config
    filePath = path.join(workspaceRoot, 'qos_applications', 'apps', 'include', 'unirtos_apps_config.h.in');
    block = `\n/**\n * Hello world demo config define\n */\n#cmakedefine CONFIG_QAPP_HELLO_WORLD_DEMO_FUNC\n`;
    if (!appendTextToFileBottom(filePath, block)) return false;

    // step 7: apps_init.c — replace existing apps_init
    filePath = path.join(workspaceRoot, 'qos_applications', 'apps', 'app_init', 'apps_init.c');
    block = `#ifdef CONFIG_QAPP_HELLO_WORLD_DEMO_FUNC\nextern void quec_hello_word_init(void);\n#endif /* CONFIG_QAPP_HELLO_WORLD_DEMO_FUNC */\n\nvoid apps_init(void)\n{\n    #ifdef CONFIG_QAPP_HELLO_WORLD_DEMO_FUNC\n    quec_hello_word_init();\n    #endif /* CONFIG_QAPP_HELLO_WORLD_DEMO_FUNC */\n}\n`;
    const fnRegex = /void\s+apps_init\s*\(\s*void\s*\)\s*\{[\s\S]*?\}/m;
    const replaced = replaceTextInFile(filePath, fnRegex, block);
    if (!replaced) {
      if (!appendTextToFileBottom(filePath, '\n' + block)) return false;
    }

    // step 8: target.config
    filePath = path.join(workspaceRoot, 'target.config');
    block = `\nCONFIG_QAPP_HELLO_WORLD_DEMO_FUNC=y\n`;
    if (!appendTextToFileBottom(filePath, block)) return false;

    // step 9: show_view.cmake
    filePath = path.join(workspaceRoot, 'show_view.cmake');
    block = `\n# Customer apps\nmessage("\nCustomer Apps")\nmessage(STATUS "CONFIG_QAPP_HELLO_WORLD_DEMO_FUNC ------------------------- $\{CONFIG_QAPP_HELLO_WORLD_DEMO_FUNC\}")\n`;
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
async function runBuildScript(workspaceRoot: string): Promise<boolean> {
  const output = vscode.window.createOutputChannel('UniRTOS Build');
  output.show(true);

  const script = 'buildlib_unirtos.bat';
  const isWin = process.platform === 'win32';
  const cmd = isWin ? `cmd.exe /c ${script}` : `./${script}`;

  return await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Building SDK',
    cancellable: false
  }, async () => {
    return new Promise<boolean>((resolve) => {
      output.appendLine(`Running: ${cmd}`);
      const child = exec(cmd, { cwd: workspaceRoot });

      if (child.stdout) child.stdout.on('data', (d) => output.append(d.toString()));
      if (child.stderr) child.stderr.on('data', (d) => output.append(d.toString()));

      child.on('error', (err) => {
        output.appendLine('Build process error: ' + err.message);
        resolve(false);
      });

      child.on('close', (code) => {
        if (code === 0) {
          output.appendLine('Build finished successfully.');
          resolve(true);
        } else {
          output.appendLine(`Build exited with code ${code}.`);
          resolve(false);
        }
      });
    });
  });
}

async function handleCreateDemoMessage(message: any, context: vscode.ExtensionContext) {
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


    // check workspace + sdk folder
    let dest = path.join(workspaceRoot, 'qos_applications', 'apps');
    if (!fs.existsSync(dest)) {
      vscode.window.showErrorMessage('SDK folder does not exist.');
      return;
    }

    // Destination: <workspaceRoot>/qos_applications/apps/<id>
    dest = path.join(workspaceRoot, 'qos_applications', 'apps', id);
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
      return;
    }

    vscode.window.showInformationMessage(`Cloned demo project '${id}' to ${finalDest}`);

    // Update sdk files
    try {
      const ok = updateSdkFiles(workspaceRoot);
      if (!ok) {
        vscode.window.showWarningMessage('Failed to update SDK files.');
        return;
      }
    } catch (e) {
      vscode.window.showWarningMessage('Failed to update SDK files.');
      console.warn('Failed to update SDK files:', e);
      return;
    }

    // Build SDK by running top-level script
    try {
      const built = await runBuildScript(workspaceRoot);
      if (!built) {
        vscode.window.showWarningMessage('SDK build failed. See "UniRTOS Build" output for details.');
        return;
      }
    } catch (e) {
      vscode.window.showWarningMessage('SDK build failed.');
      console.error('SDK build failed', e);
      return;
    }

    if (addToSdk) {
      // Placeholder: user requested add to SDK — extension can react here.
      vscode.window.showInformationMessage('Requested to add demo project to current SDK (no-op).');
    }
  } catch (e: any) {
    vscode.window.showErrorMessage('Failed to clone demo project: ' + (e && e.message ? e.message : e));
    console.error('Failed to clone demo project', e);
  }
}
