import {
    Diagnostic,
    DiagnosticSeverity,
} from 'vscode-languageserver/node';
import { NavigatorSettings } from "./types";
import {
	WorkspaceFolder
} from 'vscode-languageserver-protocol';

import Uri from 'vscode-uri';
import { exec } from 'child_process';
import { promisify } from 'util';
const async_exec = promisify(exec);


export async function perlcompile(filePath: string, workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): Promise<Diagnostic[]> {
    const commandSwitch = (settings.enableAllWarnings ? " -cw " : " -c ");
    const inc = getIncPaths(workspaceFolders, settings);
    const compCmd = settings.perlPath + commandSwitch + inc + '"' + filePath + '"';
    console.log("Starting perl compilation check with: " + compCmd);
    let output: string;
    let severity: DiagnosticSeverity;
    const diagnostics: Diagnostic[] = [];

    try {
        const out = await async_exec(compCmd, {timeout: 15000}); // 15 second timeout
        output = out.stderr;
        severity = DiagnosticSeverity.Warning;
    } catch(error: any) {
        if("stderr" in error){
            output = error.stderr;
            severity = DiagnosticSeverity.Error;
        } else {
            console.log("Perlcompile failed with unknown error")
            console.log(error);
            return diagnostics;
        }
    }

    output.split("\n").forEach(violation => {
        maybeAddCompDiag(violation, severity, diagnostics, filePath);
    });
    return diagnostics;
}


// TODO: This behaviour should be temporary. Review and update treatment of multi-root workspaces
function getIncPaths(workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings) {
    let includePaths: string[] = [];

    settings.includePaths.forEach(path => {
        path = path.replace(/ /g, '\\ ');
        if (/\$workspaceFolder/.test(path)) {
            if (workspaceFolders) {
                workspaceFolders.forEach(workspaceFolder => {
                    // TODO: Consider switching to spawn instead for better way to escape characters. Better for large return data as well
                    const clean = Uri.parse(workspaceFolder.uri).fsPath.replace(/ /g, '\\ ');
                    includePaths = includePaths.concat(["-I", path.replace(/\$workspaceFolder/g, clean)]);
                });
            } else {
                console.log("You used $workspaceFolder in your config, but didn't add any workspace folders. Skipping " + path);
            }
        } else {
            includePaths = includePaths.concat(["-I", path]);
        }
    });
    return " " + includePaths.join(" ") + " ";
}

function maybeAddCompDiag(violation: string, severity: DiagnosticSeverity , diagnostics: Diagnostic[], filePath: string): void {

    const patt = /at\s+(.+)\s+line\s+(\d+)/i;
    const match = patt.exec(violation);

    if(!match){
        return;
    }
    let lineNum = +match[2] - 1;
    if (match[1] != filePath){
        // The error/warnings must be in an imported library. TODO: Place error on the import statement. For now, line 0 works
        lineNum = 0;
    }

    diagnostics.push({
        severity: severity,
        range: {
            start: { line: lineNum, character: 0 },
            end: { line: lineNum, character: 500 }
        },
        message: "Syntax: " + violation,
        source: 'perlnavigator'
    });
}

export async function perlcritic(filePath: string, workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): Promise<Diagnostic[]> {

    let criticSwitch = " --verbose" + ' "%s~|~%l~|~%c~|~%m~|~%p~||~%n" ';

    const criticCmd = settings.perlcriticPath + ' "' + filePath + '"' + criticSwitch;
    console.log("Now starting perlcritic with: " + criticCmd);

    const diagnostics: Diagnostic[] = [];
    console.log("In perl critic at least");
    try {
        const { stdout, stderr } = await async_exec(criticCmd, {timeout: 15000});
        console.log("Perlcritic found no issues" + stdout + stderr);
    } catch(error: any) {
        if("stdout" in error){
            const output: string = error.stdout;
            console.log(output);
            output.split("\n").forEach(violation => {
                maybeAddCriticDiag(violation, diagnostics, settings);
            });
        } else {
            console.log("Perlcritic failed with unknown error")
            console.log(error);
        }
    }
    return diagnostics;
}

function getCriticProfile (workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings) {
    let profileCmd: string;
    if (settings.perlcriticProfile) {
        let clean = settings.perlcriticProfile;
        if (/\$workspaceFolder/.test(clean)){
            if (workspaceFolders){
                // TODO: Fix this too. Only uses the first workspace folder
                clean = Uri.parse(workspaceFolders[0].uri).fsPath;
                profileCmd = " --profile " + settings.perlcriticProfile.replace(/\$workspaceFolder/g, clean).replace(/ /g, '\\ ');
            } else {
                console.log("You specified $workspaceFolder in your perlcritic path, but didn't include any workspace folders. Ignoring profile.");
            }
        } else {
            profileCmd = " --profile " + settings.perlcriticProfile.replace(/ /g, '\\ ');
        }
    }
}

function maybeAddCriticDiag(violation: string, diagnostics: Diagnostic[], settings: NavigatorSettings): void {

    // Severity ~|~ Line ~|~ Column ~|~ Description ~|~ Policy ~||~ Newline
    const tokens = violation.replace("~||~", "").split("~|~");
    if(tokens.length != 5){
        return;
    }
    const line_num = +tokens[1] - 1;
    const col_num  = +tokens[2] - 1;
    const message = tokens[3] + " (" + tokens[4] + ", Severity: " + tokens[0] + ")";
    const severity = getCriticDiagnosticSeverity(tokens[0], settings);
    if(!severity){
        return;
    }
    diagnostics.push({
        severity: severity,
        range: {
            start: { line: line_num, character: col_num },
            end: { line: line_num, character: col_num+500 } // Arbitrarily large
        },
        message: "Critic: " + message,
        source: 'perlnavigator'
    });
}

function getCriticDiagnosticSeverity(severity_num: string, settings: NavigatorSettings): DiagnosticSeverity | undefined {
    
    // Unknown severity gets max (should never happen)
    const severity_config = severity_num == '1' ? settings.severity1 :
                            severity_num == '2' ? settings.severity2 :
                            severity_num == '3' ? settings.severity3 :
                            severity_num == '4' ? settings.severity4 :
                                                  settings.severity5 ; 

    switch (severity_config) {
        case "none":
            return undefined;
        case "hint":
            return DiagnosticSeverity.Hint;
        case "info":
            return DiagnosticSeverity.Information;
        case "warning":
            return DiagnosticSeverity.Warning;
        default:
            return DiagnosticSeverity.Error;
    }
}