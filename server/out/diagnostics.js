"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.perlcritic = exports.perlcompile = void 0;
const node_1 = require("vscode-languageserver/node");
const path_1 = require("path");
const vscode_uri_1 = require("vscode-uri");
const utils_1 = require("./utils");
const parseDocument_1 = require("./parseDocument");
async function perlcompile(textDocument, workspaceFolders, settings) {
    var _a, _b, _c, _d, _e, _f;
    let perlParams = ["-c"];
    const filePath = vscode_uri_1.default.parse(textDocument.uri).fsPath;
    if (settings.enableWarnings)
        perlParams = perlParams.concat(["-Mwarnings", "-M-warnings=redefine"]); // Force enable some warnings.
    perlParams = perlParams.concat((0, utils_1.getIncPaths)(workspaceFolders, settings));
    perlParams = perlParams.concat(getInquisitor());
    (0, utils_1.nLog)("Starting perl compilation check with the equivalent of: " + settings.perlPath + " " + perlParams.join(" ") + " " + filePath, settings);
    let output;
    let stdout;
    let severity;
    const diagnostics = [];
    const code = getAdjustedPerlCode(textDocument, filePath);
    try {
        const process = (0, utils_1.async_execFile)(settings.perlPath, perlParams, { timeout: 10000, maxBuffer: 20 * 1024 * 1024 });
        (_b = (_a = process === null || process === void 0 ? void 0 : process.child) === null || _a === void 0 ? void 0 : _a.stdin) === null || _b === void 0 ? void 0 : _b.on('error', (error) => {
            (0, utils_1.nLog)("Perl Compilation Error Caught: ", settings);
            (0, utils_1.nLog)(error, settings);
        });
        (_d = (_c = process === null || process === void 0 ? void 0 : process.child) === null || _c === void 0 ? void 0 : _c.stdin) === null || _d === void 0 ? void 0 : _d.write(code);
        (_f = (_e = process === null || process === void 0 ? void 0 : process.child) === null || _e === void 0 ? void 0 : _e.stdin) === null || _f === void 0 ? void 0 : _f.end();
        const out = await process;
        output = out.stderr;
        stdout = out.stdout;
        severity = node_1.DiagnosticSeverity.Warning;
    }
    catch (error) {
        // TODO: Check if we overflowed the buffer.
        if ("stderr" in error && "stdout" in error) {
            output = error.stderr;
            stdout = error.stdout;
            severity = node_1.DiagnosticSeverity.Error;
        }
        else {
            (0, utils_1.nLog)("Perlcompile failed with unknown error", settings);
            (0, utils_1.nLog)(error, settings);
            return;
        }
    }
    const perlDoc = await (0, parseDocument_1.buildNav)(stdout);
    output.split("\n").forEach(violation => {
        maybeAddCompDiag(violation, severity, diagnostics, filePath, perlDoc);
    });
    return { diags: diagnostics, perlDoc: perlDoc };
}
exports.perlcompile = perlcompile;
function getInquisitor() {
    const inq_path = (0, path_1.join)((0, path_1.dirname)(__dirname), 'src', 'perl');
    let inq = ['-I', inq_path, '-MInquisitor'];
    return inq;
}
function getAdjustedPerlCode(textDocument, filePath) {
    let code = textDocument.getText();
    code = `local \$0; use lib_bs22::SourceStash; BEGIN { \$0 = '${filePath}'; if (\$INC{'FindBin.pm'}) { FindBin->again(); }; \$lib_bs22::SourceStash::filename = '${filePath}'; print "Setting file" . __FILE__; }\n# line 0 \"${filePath}\"\ndie('Not needed, but die for safety');\n` + code;
    return code;
}
function maybeAddCompDiag(violation, severity, diagnostics, filePath, perlDoc) {
    violation = violation.replace(/\r/g, ""); // Clean up for Windows
    violation = violation.replace(/, <STDIN> line 1\.$/g, ""); // Remove our stdin nonsense
    const lineNum = localizeErrors(violation, filePath, perlDoc);
    if (typeof lineNum == 'undefined')
        return;
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
function localizeErrors(violation, filePath, perlDoc) {
    if (/Too late to run CHECK block/.test(violation))
        return;
    let match = /at\s+(.+?)\s+line\s+(\d+)/i.exec(violation);
    if (match) {
        if (match[1] == filePath) {
            return +match[2] - 1;
        }
        else {
            // The error/warnings must be in an imported library (possibly indirectly imported).
            let importLine = 0; // If indirectly imported
            const importFileName = match[1].replace('.pm', '').replace(/[\\\/]/g, "::");
            perlDoc.imported.forEach((line, mod) => {
                // importFileName could be something like usr::lib::perl::dir::Foo::Bar
                if (importFileName.endsWith(mod)) {
                    importLine = line;
                }
            });
            return importLine;
        }
    }
    match = /\s+is not exported by the ([\w:]+) module$/i.exec(violation);
    if (match) {
        let importLine = perlDoc.imported.get(match[1]);
        if (typeof importLine != 'undefined') {
            return importLine;
        }
        else {
            return 0;
        }
    }
    return;
}
async function perlcritic(textDocument, workspaceFolders, settings) {
    var _a, _b, _c, _d, _e, _f;
    if (!settings.perlcriticEnabled)
        return [];
    const critic_path = (0, path_1.join)((0, path_1.dirname)(__dirname), 'src', 'perl', 'criticWrapper.pl');
    let criticParams = [critic_path].concat(getCriticProfile(workspaceFolders, settings));
    criticParams = criticParams.concat(['--file', vscode_uri_1.default.parse(textDocument.uri).fsPath]);
    (0, utils_1.nLog)("Now starting perlcritic with: " + criticParams.join(" "), settings);
    const code = textDocument.getText();
    const diagnostics = [];
    let output;
    try {
        const process = (0, utils_1.async_execFile)(settings.perlPath, criticParams, { timeout: 25000 });
        (_b = (_a = process === null || process === void 0 ? void 0 : process.child) === null || _a === void 0 ? void 0 : _a.stdin) === null || _b === void 0 ? void 0 : _b.on('error', (error) => {
            (0, utils_1.nLog)("Perl Critic Error Caught: ", settings);
            (0, utils_1.nLog)(error, settings);
        });
        (_d = (_c = process === null || process === void 0 ? void 0 : process.child) === null || _c === void 0 ? void 0 : _c.stdin) === null || _d === void 0 ? void 0 : _d.write(code);
        (_f = (_e = process === null || process === void 0 ? void 0 : process.child) === null || _e === void 0 ? void 0 : _e.stdin) === null || _f === void 0 ? void 0 : _f.end();
        const out = await process;
        output = out.stdout;
    }
    catch (error) {
        (0, utils_1.nLog)("Perlcritic failed with unknown error", settings);
        (0, utils_1.nLog)(error, settings);
        return diagnostics;
    }
    (0, utils_1.nLog)("Critic output" + output, settings);
    output.split("\n").forEach(violation => {
        maybeAddCriticDiag(violation, diagnostics, settings);
    });
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
                (0, utils_1.nLog)("You specified $workspaceFolder in your perlcritic path, but didn't include any workspace folders. Ignoring profile.", settings);
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
    const tokens = violation.replace("~||~", "").replace(/\r/g, "").split("~|~");
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
//# sourceMappingURL=diagnostics.js.map