import {
    Diagnostic,
    DiagnosticSeverity,
} from 'vscode-languageserver/node';
import { NavigatorSettings, DiagnosedDoc } from "./types";
import {
	WorkspaceFolder
} from 'vscode-languageserver-protocol';
import { dirname, join } from 'path';
import Uri from 'vscode-uri';
import { getIncPaths, async_execFile } from './utils';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';

export async function perlcompile(textDocument: TextDocument, workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): Promise<DiagnosedDoc> {
    let perlParams: string[] = ["-c"];
    const filePath = Uri.parse(textDocument.uri).fsPath;

    if(settings.enableWarnings) perlParams = perlParams.concat(["-Mwarnings", "-M-warnings=redefine"]); // Force enable some warnings.
    perlParams = perlParams.concat(getIncPaths(workspaceFolders, settings));
    perlParams = perlParams.concat(getInquisitor());
    perlParams.push(filePath)

    console.log("Starting perl compilation check: " + settings.perlPath + " " + perlParams.join(" "));
    perlParams.push("--stdin"); // User can run command above for debugging, we need --stdin

    let output: string;
    let stdout: string;
    let severity: DiagnosticSeverity;
    const diagnostics: Diagnostic[] = [];
    const code = textDocument.getText();
    try {
        const process = async_execFile(settings.perlPath, perlParams, {timeout: 10000, maxBuffer: 20 * 1024 * 1024});
        process?.child?.stdin?.on('error', (error) => console.log("Perl Compilation Error Caught: ", error));
        process?.child?.stdin?.write(code);
        process?.child?.stdin?.end();
        const out = await process;

        output = out.stderr;
        stdout = out.stdout;
        severity = DiagnosticSeverity.Warning;
    } catch(error: any) {
        // TODO: Check if we overflowed the buffer.
        if("stderr" in error && "stdout" in error){
            output = error.stderr;
            stdout = error.stdout;
            severity = DiagnosticSeverity.Error;
        } else {
            console.log("Perlcompile failed with unknown error")
            console.log(error);
            return {diags: diagnostics, rawTags: ""};
        }
    }
    // console.log(stdout);

    output.split("\n").forEach(violation => {
        maybeAddCompDiag(violation, severity, diagnostics, filePath);
    });
    return {diags: diagnostics, rawTags: stdout};
}

function getInquisitor(): string[]{
    const inq_path = join(dirname(__dirname), 'src', 'perl');
    const inq_file = join(inq_path, 'Inquisitor.pl');
    let inq: string[] = ['-I', inq_path, inq_file];
    return inq;
}

function maybeAddCompDiag(violation: string, severity: DiagnosticSeverity , diagnostics: Diagnostic[], filePath: string): void {

    const patt = /at\s+(.+?)\s+line\s+(\d+)/i;
    const match = patt.exec(violation);

    if(!match){
        return;
    }
    if(/Too late to run CHECK block/.test(violation)) return;

    let lineNum = +match[2] - 1;
    if (match[1] != filePath){
        // The error/warnings must be in an imported library. TODO: Place error on the import statement. For now, line 0 works
        lineNum = 0;
    }
    violation = violation.replace(/\r/g, ""); // Clean up for Windows
    violation = violation.replace(/, <STDIN> line 1\.$/g, ""); // Remove our stdin nonsense

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

export async function perlcritic(textDocument: TextDocument, workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): Promise<Diagnostic[]> {
    if(!settings.perlcriticEnabled) return []; 
    const critic_path = join(dirname(__dirname), 'src', 'perl', 'criticWrapper.pl');
    let criticParams: string[] = [critic_path].concat(getCriticProfile(workspaceFolders, settings));
    criticParams = criticParams.concat(['--file', Uri.parse(textDocument.uri).fsPath]);

    console.log("Now starting perlcritic with: " + criticParams.join(" "));
    const code = textDocument.getText();
    const diagnostics: Diagnostic[] = [];
    let output: string;
    try {
        const process = async_execFile(settings.perlPath, criticParams, {timeout: 25000});
        process?.child?.stdin?.on('error', (error) => console.log("Perl Critic Error Caught: ", error));
        process?.child?.stdin?.write(code);
        process?.child?.stdin?.end();
        const out = await process;
        output = out.stdout;
    } catch(error: any) {
        console.log("Perlcritic failed with unknown error");
        console.log(error);
        return diagnostics;
    }

    console.log("Critic output" + output);
    output.split("\n").forEach(violation => {
        maybeAddCriticDiag(violation, diagnostics, settings);
    });

    return diagnostics;
}

function getCriticProfile (workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): string[] {
    let profileCmd: string[] = [];
    if (settings.perlcriticProfile) {
        let profile = settings.perlcriticProfile;
        if (/\$workspaceFolder/.test(profile)){
            if (workspaceFolders){
                // TODO: Fix this too. Only uses the first workspace folder
                const workspaceUri = Uri.parse(workspaceFolders[0].uri).fsPath;
                profileCmd.push('--profile');
                profileCmd.push(profile.replace(/\$workspaceFolder/g, workspaceUri));
            } else {
                console.log("You specified $workspaceFolder in your perlcritic path, but didn't include any workspace folders. Ignoring profile.");
            }
        } else {
            profileCmd.push('--profile');
            profileCmd.push(profile);
        }
    }
    return profileCmd;
}

function maybeAddCriticDiag(violation: string, diagnostics: Diagnostic[], settings: NavigatorSettings): void {

    // Severity ~|~ Line ~|~ Column ~|~ Description ~|~ Policy ~||~ Newline
    const tokens = violation.replace("~||~", "").replace(/\r/g, "").split("~|~");
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