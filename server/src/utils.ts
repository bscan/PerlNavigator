import { NavigatorSettings } from "./types";
import {
	WorkspaceFolder
} from 'vscode-languageserver-protocol';
import Uri from 'vscode-uri';
import { execFile } from 'child_process';
import { promisify } from 'util';

export const async_execFile = promisify(execFile);

// TODO: This behaviour should be temporary. Review and update treatment of multi-root workspaces
export function getIncPaths(workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): string[] {
    let includePaths: string[] = [];

    settings.includePaths.forEach(path => {
        if (/\$workspaceFolder/.test(path)) {
            if (workspaceFolders) {
                workspaceFolders.forEach(workspaceFolder => {
                    const incPath = Uri.parse(workspaceFolder.uri).fsPath;
                    includePaths = includePaths.concat(["-I", path.replace(/\$workspaceFolder/g, incPath)]);
                });
            } else {
                console.log("You used $workspaceFolder in your config, but didn't add any workspace folders. Skipping " + path);
            }
        } else {
            includePaths = includePaths.concat(["-I", path]);
        }
    });
    return includePaths;
}
