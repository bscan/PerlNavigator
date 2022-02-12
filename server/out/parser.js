"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.perlcritic = exports.perlcompile = void 0;
const node_1 = require("vscode-languageserver/node");
const path_1 = require("path");
const vscode_uri_1 = require("vscode-uri");
const child_process_1 = require("child_process");
const util_1 = require("util");
const async_execFile = (0, util_1.promisify)(child_process_1.execFile);
async function perlcompile(filePath, workspaceFolders, settings) {
    let perlParams = ["-c"];
    if (settings.enableWarnings)
        perlParams.push("-Mwarnings");
    perlParams = perlParams.concat(getIncPaths(workspaceFolders, settings));
    perlParams = perlParams.concat(getInquisitor());
    perlParams.push(filePath);
    console.log("Starting perl compilation check with: " + perlParams.join(" "));
    let output;
    let stdout;
    let severity;
    const diagnostics = [];
    try {
        const out = await async_execFile(settings.perlPath, perlParams, { timeout: 20000, maxBuffer: 10 * 1024 * 1024 });
        output = out.stderr;
        stdout = out.stdout;
        severity = node_1.DiagnosticSeverity.Warning;
    }
    catch (error) {
        if ("stderr" in error && "stdout" in error) {
            output = error.stderr;
            stdout = error.stdout;
            severity = node_1.DiagnosticSeverity.Error;
        }
        else {
            console.log("Perlcompile failed with unknown error");
            console.log(error);
            return diagnostics;
        }
    }
    console.log(stdout);
    output.split("\n").forEach(violation => {
        maybeAddCompDiag(violation, severity, diagnostics, filePath);
    });
    return diagnostics;
}
exports.perlcompile = perlcompile;
function getInquisitor() {
    const inq_loc = (0, path_1.join)((0, path_1.dirname)(__dirname), 'src', 'perl');
    let inq = ['-I', inq_loc, '-MInquisitor'];
    return inq;
}
// TODO: This behaviour should be temporary. Review and update treatment of multi-root workspaces
function getIncPaths(workspaceFolders, settings) {
    let includePaths = [];
    settings.includePaths.forEach(path => {
        if (/\$workspaceFolder/.test(path)) {
            if (workspaceFolders) {
                workspaceFolders.forEach(workspaceFolder => {
                    const incPath = vscode_uri_1.default.parse(workspaceFolder.uri).fsPath;
                    includePaths = includePaths.concat(["-I", path.replace(/\$workspaceFolder/g, incPath)]);
                });
            }
            else {
                console.log("You used $workspaceFolder in your config, but didn't add any workspace folders. Skipping " + path);
            }
        }
        else {
            includePaths = includePaths.concat(["-I", path]);
        }
    });
    return includePaths;
}
function maybeAddCompDiag(violation, severity, diagnostics, filePath) {
    const patt = /at\s+(.+?)\s+line\s+(\d+)/i;
    const match = patt.exec(violation);
    if (!match) {
        return;
    }
    let lineNum = +match[2] - 1;
    if (match[1] != filePath) {
        // The error/warnings must be in an imported library. TODO: Place error on the import statement. For now, line 0 works
        lineNum = 0;
    }
    violation = violation.replace("\r", ""); // Clean up for Windows
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
async function perlcritic(filePath, workspaceFolders, settings) {
    let criticParams = ['--verbose', '%s~|~%l~|~%c~|~%m~|~%p~||~%n'];
    criticParams = criticParams.concat(getCriticProfile(workspaceFolders, settings));
    criticParams.push(filePath);
    console.log("Now starting perlcritic with: " + criticParams.join(" "));
    const diagnostics = [];
    console.log("In perl critic at least");
    try {
        const { stdout, stderr } = await async_execFile(settings.perlcriticPath, criticParams, { timeout: 30000 });
        console.log("Perlcritic found no issues" + stdout + stderr);
    }
    catch (error) {
        if ("stdout" in error) {
            if ("stderr" in error && error.stderr)
                console.log("perl critic diags: " + error.stderr);
            const output = error.stdout;
            console.log(output);
            output.split("\n").forEach(violation => {
                maybeAddCriticDiag(violation, diagnostics, settings);
            });
        }
        else {
            console.log("Perlcritic failed with unknown error");
            console.log(error);
        }
    }
    return diagnostics;
}
exports.perlcritic = perlcritic;
function getCriticProfile(workspaceFolders, settings) {
    let profileCmd = [];
    if (settings.perlcriticProfile) {
        let profile = settings.perlcriticProfile;
        if (/\$workspaceFolder/.test(profile)) {
            if (workspaceFolders) {
                // TODO: Fix this too. Only uses the first workspace folder
                const workspaceUri = vscode_uri_1.default.parse(workspaceFolders[0].uri).fsPath;
                profileCmd.push('--profile');
                profileCmd.push(profile.replace(/\$workspaceFolder/g, workspaceUri));
            }
            else {
                console.log("You specified $workspaceFolder in your perlcritic path, but didn't include any workspace folders. Ignoring profile.");
            }
        }
        else {
            profileCmd.push('--profile');
            profileCmd.push(profile);
        }
    }
    return profileCmd;
}
function maybeAddCriticDiag(violation, diagnostics, settings) {
    // Severity ~|~ Line ~|~ Column ~|~ Description ~|~ Policy ~||~ Newline
    const tokens = violation.replace("~||~", "").replace("\r", "").split("~|~");
    if (tokens.length != 5) {
        return;
    }
    const line_num = +tokens[1] - 1;
    const col_num = +tokens[2] - 1;
    const message = tokens[3] + " (" + tokens[4] + ", Severity: " + tokens[0] + ")";
    const severity = getCriticDiagnosticSeverity(tokens[0], settings);
    if (!severity) {
        return;
    }
    diagnostics.push({
        severity: severity,
        range: {
            start: { line: line_num, character: col_num },
            end: { line: line_num, character: col_num + 500 } // Arbitrarily large
        },
        message: "Critic: " + message,
        source: 'perlnavigator'
    });
}
function getCriticDiagnosticSeverity(severity_num, settings) {
    // Unknown severity gets max (should never happen)
    const severity_config = severity_num == '1' ? settings.severity1 :
        severity_num == '2' ? settings.severity2 :
            severity_num == '3' ? settings.severity3 :
                severity_num == '4' ? settings.severity4 :
                    settings.severity5;
    switch (severity_config) {
        case "none":
            return undefined;
        case "hint":
            return node_1.DiagnosticSeverity.Hint;
        case "info":
            return node_1.DiagnosticSeverity.Information;
        case "warning":
            return node_1.DiagnosticSeverity.Warning;
        default:
            return node_1.DiagnosticSeverity.Error;
    }
}
//# sourceMappingURL=parser.js.map