import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';

export function platformFilePath(context: vscode.ExtensionContext): Record<string, any> {
    const platformFile = path.join(context.extensionPath, 'src', 'data', 'platform.json');
    let platforms: Record<string, any> = {};
    try {
        const raw = fs.readFileSync(platformFile, 'utf8');
        platforms = JSON.parse(raw);
    } catch (e) {
        platforms = {};
    }
    return platforms;
}

export function handlePlatformChanged(msgValue: unknown, platforms: Record<string, any>, webview: vscode.Webview) {
    const selected = (msgValue as string) || undefined;
    let models: string[] = [];
    if (selected) {
        const modelsRaw = platforms[selected];
        if (Array.isArray(modelsRaw)) models = modelsRaw as string[];
        else if (modelsRaw && typeof modelsRaw === 'object') models = Object.keys(modelsRaw as Record<string, unknown>);
    }
    try {
        webview.postMessage({ type: 'setModels', models });
    } catch (e) {
        console.warn('Failed to post setModels message to webview:', e);
    }
}

// send platforms when webview is ready or on-demand
export const sendPlatforms = (webview: vscode.Webview, platformKeys: string[]) => {
webview.postMessage({ type: 'setPlatforms', platforms: platformKeys });
};

/**
 * Write a minimal `app.json` manifest into `folderPath`.
 * Returns true on success, false on error.
 */
export function writeAppJsonToFolder(folderPath: string, appManifest: any): boolean {
    try {
        const appJsonPath = path.join(folderPath, 'app.json');
        fs.writeFileSync(appJsonPath, JSON.stringify(appManifest, null, 2), 'utf8');
        return true;
    } catch (e) {
        console.warn('Failed to write app.json to folder:', folderPath, e);
        return false;
    }
}
