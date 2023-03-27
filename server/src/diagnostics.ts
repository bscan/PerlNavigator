import {
    Diagnostic,
    DiagnosticSeverity,
} from 'vscode-languageserver/node';
import { NavigatorSettings, CompilationResults, PerlDocument } from "./types";
import {
	WorkspaceFolder
} from 'vscode-languageserver-protocol';
import { dirname, join } from 'path';
import Uri from 'vscode-uri';
import { getIncPaths, getPerlimportsProfile, async_execFile, nLog } from './utils';
import { buildNav } from "./parseDocument";
import { getPerlAssetsPath } from "./assets";

import {
    TextDocument
} from 'vscode-languageserver-textdocument';

export async function perlcompile(textDocument: TextDocument, workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): Promise<CompilationResults | void> {
    let perlParams: string[] = [...settings.perlParams, "-c"];
    const filePath = Uri.parse(textDocument.uri).fsPath;

    if(settings.enableWarnings) perlParams = perlParams.concat(["-Mwarnings", "-M-warnings=redefine"]); // Force enable some warnings.
    perlParams = perlParams.concat(getIncPaths(workspaceFolders, settings));
    perlParams = perlParams.concat(getInquisitor());
    nLog("Starting perl compilation check with the equivalent of: " + settings.perlPath + " " + perlParams.join(" ") + " " + filePath, settings);

    let output: string;
    let stdout: string;
    let severity: DiagnosticSeverity;
    const diagnostics: Diagnostic[] = [];
    const code = getAdjustedPerlCode(textDocument, filePath);
    try {
        const process = async_execFile(settings.perlPath, perlParams, {timeout: 10000, maxBuffer: 20 * 1024 * 1024});
        process?.child?.stdin?.on('error', (error: any) => { 
            nLog("Perl Compilation Error Caught: ", settings);
            nLog(error, settings);
        });
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
            nLog("Perlcompile failed with unknown error", settings);
            nLog(error, settings);
            return;
        }
    }

    const perlDoc = await buildNav(stdout, filePath, textDocument.uri);

    output.split("\n").forEach(violation => {
        maybeAddCompDiag(violation, severity, diagnostics, filePath, perlDoc);
    });
    return {diags: diagnostics, perlDoc: perlDoc};
}

function getInquisitor(): string[]{
    const inq_path = getPerlAssetsPath();
    let inq: string[] = ['-I', inq_path, '-MInquisitor'];
    return inq;
}

function getAdjustedPerlCode(textDocument: TextDocument, filePath: string): string {
    let code = textDocument.getText();

    // module name regex stolen from https://metacpan.org/pod/Module::Runtime#$module_name_rx
    const module_name_rx = /^\s*package[\s\n]+([A-Z_a-z][0-9A-Z_a-z]*(?:::[0-9A-Z_a-z]+)*)/gm;
    let register_inc_path = '';
    let module_name_match = module_name_rx.exec(code);
    while (module_name_match != null) {
        const module_name = module_name_match[1];
        const inc_filename = module_name.replace(/::/g, '/') + '.pm';
        // make sure the package found actually matches the filename
        if (filePath.match('.*' + inc_filename)) {
            register_inc_path = `\$INC{'${inc_filename}'} = '${filePath}';`;
            break;
        } else {
            module_name_match = module_name_rx.exec(code);
        }
    }

    code = `local \$0; use lib_bs22::SourceStash; BEGIN { \$0 = '${filePath}'; if (\$INC{'FindBin.pm'}) { FindBin->again(); }; \$lib_bs22::SourceStash::filename = '${filePath}'; print "Setting file" . __FILE__; ${register_inc_path} }\n# line 0 \"${filePath}\"\ndie('Not needed, but die for safety');\n` + code;
    return code;
}

function maybeAddCompDiag(violation: string, severity: DiagnosticSeverity , diagnostics: Diagnostic[], filePath: string, perlDoc: PerlDocument): void {

    violation = violation.replace(/\r/g, ""); // Clean up for Windows
    violation = violation.replace(/, <STDIN> line 1\.$/g, ""); // Remove our stdin nonsense

    let output = localizeErrors(violation, filePath, perlDoc);
    if (typeof output == 'undefined') return;
    const lineNum = output.lineNum;
    violation = output.violation;

    if( /=PerlWarning=/.test(violation) ){
        // Downgrade severity for explicitly marked severities
        severity = DiagnosticSeverity.Warning;
        violation = violation.replace(/=PerlWarning=/g, ""); // Don't display the PerlWarnings
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


function localizeErrors (violation: string, filePath: string, perlDoc: PerlDocument): {violation:string, lineNum:number} | void {

    if(/Too late to run CHECK block/.test(violation)) return;

    let match = /^(.+)at\s+(.+?)\s+line\s+(\d+)/i.exec(violation);

    if(match){
        if(match[2] == filePath){
            violation = match[1];
            const lineNum = +match[3] - 1;
            return {violation, lineNum};
        } else {
            // The error/warnings must be in an imported library (possibly indirectly imported).
            let lineNum = 0; // If indirectly imported
            const importFileName = match[2].replace('.pm', '').replace(/[\\\/]/g, "::");
            perlDoc.imported.forEach((line, mod) => {
                // importFileName could be something like usr::lib::perl::dir::Foo::Bar
                if (importFileName.endsWith(mod)){
                    lineNum = line;
                }
            })
            return {violation, lineNum}
        }
    }
    
    match = /\s+is not exported by the ([\w:]+) module$/i.exec(violation);
    if(match){
        let lineNum = perlDoc.imported.get(match[2]);
        if(typeof lineNum != 'undefined'){
            return {violation, lineNum};
        } else {
            lineNum = 0;
            return {violation, lineNum};
        }
    }
    return;
}




export async function perlcritic(textDocument: TextDocument, workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): Promise<Diagnostic[]> {
    if(!settings.perlcriticEnabled) return []; 
    const critic_path = join(getPerlAssetsPath(), 'criticWrapper.pl');
    let criticParams: string[] = [...settings.perlParams, critic_path].concat(getCriticProfile(workspaceFolders, settings));
    criticParams = criticParams.concat(['--file', Uri.parse(textDocument.uri).fsPath]);

    // Add any extra params from settings
    if(settings.perlcriticSeverity) criticParams = criticParams.concat(['--severity', settings.perlcriticSeverity.toString()]);
    if(settings.perlcriticTheme) criticParams = criticParams.concat(['--theme', settings.perlcriticTheme]);
    if(settings.perlcriticExclude) criticParams = criticParams.concat(['--exclude', settings.perlcriticExclude]);
    if(settings.perlcriticInclude) criticParams = criticParams.concat(['--include', settings.perlcriticInclude]);

    nLog("Now starting perlcritic with: " + criticParams.join(" "), settings);
    const code = textDocument.getText();
    const diagnostics: Diagnostic[] = [];
    let output: string;
    try {
        const process = async_execFile(settings.perlPath, criticParams, {timeout: 25000});
        process?.child?.stdin?.on('error', (error: any) => {
            nLog("Perl Critic Error Caught: ", settings);
            nLog(error, settings);
        });
        process?.child?.stdin?.write(code);
        process?.child?.stdin?.end();
        const out = await process;
        output = out.stdout;
    } catch(error: any) {
        nLog("Perlcritic failed with unknown error", settings);
        nLog(error, settings);
        return diagnostics;
    }

    nLog("Critic output: " + output, settings);
    output.split("\n").forEach(violation => {
        maybeAddCriticDiag(violation, diagnostics, settings);
    });

    return diagnostics;
}

export async function perlimports(textDocument: TextDocument, workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): Promise<Diagnostic[]> {
    if(!settings.perlimportsLintEnabled) return [];
    const importsPath = join(getPerlAssetsPath(), 'perlimportsWrapper.pl');
    const cliParams = [...settings.perlParams, importsPath, ...getPerlimportsProfile(settings), '--lint', '--json', '--filename', Uri.parse(textDocument.uri).fsPath];

    nLog("Now starting perlimports with: " + cliParams.join(" "), settings);
    const code = textDocument.getText();
    const diagnostics: Diagnostic[] = [];
    let output: string;
    try {
        const process = async_execFile(settings.perlPath, cliParams, {timeout: 25000});
        process?.child?.stdin?.on('error', (error: any) => {
            nLog("perlimports Error Caught: " + error, settings);
        });
        process?.child?.stdin?.write(code);
        process?.child?.stdin?.end();
        const out = await process;
        output = out.stdout;
    } catch(error: any) {
        nLog("Attempted to run perlimports lint: " + error.stdout, settings);
        output = error.message;
    }

    // The first line will be an error message about perlimports failing.
    // The last line may be blank.
    output.split("\n").filter(v => v.startsWith('{')).forEach(violation => {
        maybeAddPerlImportsDiag(violation, diagnostics, settings);
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
                nLog("You specified $workspaceFolder in your perlcritic path, but didn't include any workspace folders. Ignoring profile.", settings);
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

function maybeAddPerlImportsDiag(violation: string, diagnostics: Diagnostic[], settings: NavigatorSettings): void {
    try {
        const diag = JSON.parse(violation);
        const loc = diag.location;
        diagnostics.push({
            message: `perlimports: ${diag.reason} \n\n ${diag.diff}`,
            range: {
                start: { line: Number(loc.start.line) - 1, character: Number(loc.start.column) - 1 },
                end: { line: Number(loc.end.line) - 1, character: Number(loc.end.column) - 1 }
            },
            severity: DiagnosticSeverity.Warning,
            source: 'perlnavigator'
        })
    } catch(error: any) {
        nLog(`Could not parse JSON violation ${error}`, settings)
    }
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
