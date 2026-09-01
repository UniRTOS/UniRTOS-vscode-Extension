import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { exec } from 'child_process';
import { CONFIG_FILE } from './constants';
import { runUnirtosCli } from './commands/pythonCli';
import { runBasicEnvChecks } from './commands/checkView';

let cachedPlatforms: Record<string, any> | undefined = undefined;

export function getPlatforms(context: vscode.ExtensionContext): Record<string, any> {
    if (cachedPlatforms) return cachedPlatforms; // use cached data
    
    const platformFile = path.join(context.extensionPath, 'src', 'data', 'platform.json');
    let platforms: Record<string, any> = {};
    try {
        const raw = fs.readFileSync(platformFile, 'utf8');
        platforms = JSON.parse(raw);
    } catch (e) {
        platforms = {};
    }
    cachedPlatforms = platforms;
    return platforms;
}

export function handlePlatformChanged(msgValue: unknown, platforms: Record<string, any>, webview: vscode.Webview) {
    const selected = (msgValue as string) || undefined;
    let modules: string[] = [];
    if (selected) {
        const modulesRaw = platforms[selected];
        if (Array.isArray(modulesRaw)) modules = modulesRaw as string[];
        else if (modulesRaw && typeof modulesRaw === 'object') modules = Object.keys(modulesRaw as Record<string, unknown>);
    }
    try {
        webview.postMessage({ type: 'setModules', modules: modules });
    } catch (e) {
        console.warn('Failed to post setModules message to webview:', e);
    }
}

// send platforms when webview is ready or on-demand
export const sendPlatforms = (webview: vscode.Webview, platformKeys: string[]) => {
    webview.postMessage({ type: 'setPlatforms', platforms: platformKeys });
};

export async function switchRepositorySource(context: vscode.ExtensionContext, value: unknown): Promise<boolean> {
    if (value !== 'github' && value !== 'gitee') return false;

    const basic = runBasicEnvChecks(context, true);
    if (!basic.configPassed) {
        vscode.window.showErrorMessage((basic.reason || 'unknown') + ' Environment checks failed.');
        return false;
    }

    const repositorySource = value;
    try {
        await vscode.workspace.getConfiguration('unirtos').update(
            'mirrorSource',
            repositorySource,
            vscode.ConfigurationTarget.Global
        );
        runUnirtosCli(['git-mirror', repositorySource]);
        vscode.window.showInformationMessage(`Repository source switched to ${repositorySource}.`);
        return true;
    } catch (e) {
        vscode.window.showErrorMessage(`Failed to switch repository source to ${repositorySource}: ${e}`);
        return false;
    }
}

export function setupWebviewTheme(panel: vscode.WebviewPanel) {
    function sendTheme() {
        try {
            const vwin: any = vscode.window as any;
            const kind = vwin && vwin.activeColorTheme && vwin.activeColorTheme.kind;
            const ColorThemeKind: any = (vscode as any).ColorThemeKind || { Light: 1 };
            const theme = (kind === ColorThemeKind.Light) ? 'light' : 'dark';
            panel.webview.postMessage({ type: 'theme', theme });
        } catch (e) {
            // ignore
        }
    }
    sendTheme();
    const vwin: any = vscode.window as any;
    const disp = (typeof vwin.onDidChangeActiveColorTheme === 'function')
        ? vwin.onDidChangeActiveColorTheme(() => sendTheme())
        : { dispose() { /* noop */ } };
    panel.onDidDispose(() => disp.dispose());
}

export function readConfigFile(): any | undefined {
    try {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) return undefined;

        const workspaceRoot = folders[0].uri.fsPath;
        const configFilePath = path.join(workspaceRoot, CONFIG_FILE);
        if (!fs.existsSync(configFilePath)) return undefined;

        const raw = fs.readFileSync(configFilePath, 'utf8');
        return JSON.parse(raw || '{}');
    } catch (e) {
        // ignore missing file / parse issues and let callers handle undefined
        return undefined;
    }
}

// write config to CONFIG_FILE
export function writeConfigFile(folderPath: string, appManifest: any): boolean {
    try {
        // add computed version if missing: module + "R01A01_BETA_OCPU" + date(YYYYMMDD)
        if (!appManifest.version) {
            const module = (appManifest && typeof appManifest.pickedModule === 'string') ? appManifest.pickedModule : '';
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const dd = String(now.getDate()).padStart(2, '0');
            const date = `${yyyy}${mm}${dd}`;
            appManifest.version = `${module}R01A01_BETA_OCPU${date}`;
        }

        // Merge into existing CONFIG_FILE if present; only update build.module and build.version
        const appJsonPath = path.join(folderPath, CONFIG_FILE);
        let toWrite: any = {};
        try {
            if (fs.existsSync(appJsonPath)) {
                const rawExisting = fs.readFileSync(appJsonPath, 'utf8');
                toWrite = rawExisting ? JSON.parse(rawExisting) : {};
            } else {
                toWrite = {};
            }
        } catch (e) {
            toWrite = {};
        }

        if (!toWrite.build || typeof toWrite.build !== 'object') {
            toWrite.build = {};
        }
        if (typeof appManifest.pickedModule !== 'undefined') {
            toWrite.build.module = appManifest.pickedModule;
        }
        if (typeof appManifest.version !== 'undefined') {
            toWrite.build.version = appManifest.version;
        }

        if (typeof appManifest.sdkVersion !== 'undefined') {
            if (!toWrite.sdk || typeof toWrite.sdk !== 'object') {
                toWrite.sdk = {};
            }
            toWrite.sdk.version = appManifest.sdkVersion;
        }

        const fd = fs.openSync(appJsonPath, 'r+'); // Open existing file without truncating
        try {
        fs.ftruncateSync(fd, 0); // Clear content
        const updatedText = JSON.stringify(toWrite, null, 2) + '\n';

        fs.writeFileSync(fd, updatedText, 'utf-8'); // Write new content
        } finally {
        fs.closeSync(fd); // Always close handle
        }

        exec(`attrib +h "${appJsonPath}"`); // hide the file on Windows
        return true;
    } catch (e) {
        console.warn(`Failed to write ${CONFIG_FILE} correctly to folder:`, folderPath, e);
        return false;
    }
}

// from Open a .code-workspace file or open dest folder
export async function openWorkspaceOrFolder(dest: string): Promise<void> {
    try {
        let opened = false;
        try {
            const dirFiles = fs.readdirSync(dest);
            const workspaceFile = dirFiles.find(f => f.endsWith('.code-workspace'));
            if (workspaceFile) {
                const workspacePath = path.join(dest, workspaceFile);
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(workspacePath), false);
                opened = true;
            }
        } catch (innerErr) {
            // ignore errors reading the folder; fall back to opening the folder
        }

        if (!opened) {
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(dest), true);
        }
    } catch (e) {
        console.warn('Failed to open project workspace/folder:', e);
    }
}
