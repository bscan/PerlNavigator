import { Diagnostic, DiagnosticSeverity } from "vscode-languageserver/node";
import { ParseType, NavigatorSettings, CompilationResults, PerlDocument } from "./types";
import { WorkspaceFolder } from "vscode-languageserver-protocol";
import { dirname, join } from "path";
import Uri from "vscode-uri";
import { getIncPaths, getPerlimportsProfile, async_execFile, nLog } from "./utils";
import { buildNav } from "./parseTags";
import { getPerlAssetsPath } from "./assets";
import { parseDocument } from "./parser";

import { TextDocument } from "vscode-languageserver-textdocument";

export async function perlcompile(textDocument: TextDocument, workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): Promise<CompilationResults | void> {
    
    const parsingPromise = parseDocument(textDocument, ParseType.selfNavigation);

    if (!settings.perlCompileEnabled){
        const parsedDoc = await parsingPromise;
        return { diags: [], perlDoc: parsedDoc };
    }
    let perlParams: string[] = [...settings.perlParams, "-c"];
    let perlEnv = settings.perlEnv;
    let perlEnvAdd = settings.perlEnvAdd;
    const filePath = Uri.parse(textDocument.uri).fsPath;

    if (settings.enableWarnings) perlParams = perlParams.concat(["-Mwarnings", "-M-warnings=redefine"]); // Force enable some warnings.
    perlParams = perlParams.concat(getIncPaths(workspaceFolders, settings));
    perlParams = perlParams.concat(await getInquisitor());
    nLog("Starting perl compilation check with the equivalent of: " + settings.perlPath + " " + perlParams.join(" ") + " " + filePath, settings);


    let output: string;
    let stdout: string;
    let severity: DiagnosticSeverity;
    const diagnostics: Diagnostic[] = [];
    const code = getAdjustedPerlCode(textDocument, filePath);
    try {
        let options: {
            timeout: number;
            maxBuffer: number;
            env?: { [key: string]: string | undefined };
        } = { timeout: 10000, maxBuffer: 20 * 1024 * 1024 };
        if (perlEnv) {
            if (perlEnvAdd) {
                options.env = { ...process.env, ...perlEnv };
            } else {
                options.env = perlEnv;
            }
        }
        const perlProcess = async_execFile(settings.perlPath, perlParams, options);
        perlProcess?.child?.stdin?.on("error", (error: any) => {
            nLog("Perl Compilation Error Caught: ", settings);
            nLog(error, settings);
        });
        perlProcess?.child?.stdin?.write(code);
        perlProcess?.child?.stdin?.end();
        const out = await perlProcess;

        output = out.stderr.toString();
        stdout = out.stdout.toString();
        severity = DiagnosticSeverity.Warning;
    } catch (error: any) {
        // TODO: Check if we overflowed the buffer.
        if ("stderr" in error && "stdout" in error) {
            output = error.stderr.toString();
            stdout = error.stdout.toString();
            severity = DiagnosticSeverity.Error;
        } else {
            nLog("Perlcompile failed with unknown error", settings);
            nLog(error, settings);
            return;
        }
    }

    const compiledDoc = buildNav(stdout, filePath, textDocument.uri);
    const parsedDoc = await parsingPromise;
    const mergedDoc = mergeDocs(parsedDoc, compiledDoc);

    output.split("\n").forEach((violation) => {
        maybeAddCompDiag(violation, severity, diagnostics, filePath, mergedDoc);
    });

    // If a base object throws a warning multiple times, we want to deduplicate it to declutter the problems tab.
    const uniq_diagnostics = Array.from(new Set(diagnostics.map((diag) => JSON.stringify(diag)))).map((str) => JSON.parse(str));
    return { diags: uniq_diagnostics, perlDoc: mergedDoc };
}

async function getInquisitor(): Promise<string[]> {
    const inq_path = await getPerlAssetsPath();
    let inq: string[] = ["-I", inq_path, "-MInquisitor"];
    return inq;
}

function getAdjustedPerlCode(textDocument: TextDocument, filePath: string): string {
    let code = textDocument.getText();

    // module name regex stolen from https://metacpan.org/pod/Module::Runtime#$module_name_rx
    const module_name_rx = /^\s*package[\s\n]+([A-Z_a-z][0-9A-Z_a-z]*(?:::[0-9A-Z_a-z]+)*)/gm;
    let register_inc_path = "";
    let module_name_match = module_name_rx.exec(code);
    while (module_name_match != null) {
        const module_name = module_name_match[1];
        const inc_filename = module_name.replaceAll("::", "/") + ".pm";
        // make sure the package found actually matches the filename
        if (filePath.indexOf(inc_filename) != -1) {
            register_inc_path = `\$INC{'${inc_filename}'} = '${filePath}';`;
            break;
        } else {
            module_name_match = module_name_rx.exec(code);
        }
    }

    code =
        `local \$0; use lib_bs22::SourceStash; BEGIN { \$0 = '${filePath}'; if (\$INC{'FindBin.pm'}) { FindBin->again(); }; \$lib_bs22::SourceStash::filename = '${filePath}'; print "Setting file" . __FILE__; ${register_inc_path} }\n# line 0 \"${filePath}\"\ndie('Not needed, but die for safety');\n` +
        code;
    return code;
}

function maybeAddCompDiag(violation: string, severity: DiagnosticSeverity, diagnostics: Diagnostic[], filePath: string, perlDoc: PerlDocument): void {
    violation = violation.replaceAll("\r", ""); // Clean up for Windows
    violation = violation.replace(/, <STDIN> line 1\.$/g, ""); // Remove our stdin nonsense

    let output = localizeErrors(violation, filePath, perlDoc);
    if (typeof output == "undefined") return;
    const lineNum = output.lineNum;
    violation = output.violation;

    if (violation.indexOf("=PerlWarning=") != -1) {
        // Downgrade severity for explicitly marked severities
        severity = DiagnosticSeverity.Warning;
        violation = violation.replaceAll("=PerlWarning=", ""); // Don't display the PerlWarnings
    }

    diagnostics.push({
        severity: severity,
        range: {
            start: { line: lineNum, character: 0 },
            end: { line: lineNum, character: 500 },
        },
        message: "Syntax: " + violation,
        source: "perlnavigator",
    });
}

function localizeErrors(violation: string, filePath: string, perlDoc: PerlDocument): { violation: string; lineNum: number } | void {
    if (violation.indexOf("Too late to run CHECK block") != -1) return;

    let match = /^(.+)at\s+(.+?)\s+line\s+(\d+)/i.exec(violation);

    if (match) {
        if (match[2] == filePath) {
            violation = match[1];
            const lineNum = +match[3] - 1;
            return { violation, lineNum };
        } else {
            // The error/warnings must be in an imported library (possibly indirectly imported).
            let lineNum = 0; // If indirectly imported
            const importFileName = match[2].replace(".pm", "").replace(/[\\\/]/g, "::");
            perlDoc.imported.forEach((line, mod) => {
                // importFileName could be something like usr::lib::perl::dir::Foo::Bar
                if (importFileName.endsWith(mod)) lineNum = line;
            });
            return { violation, lineNum };
        }
    }

    match = /\s+is not exported by the ([\w:]+) module$/i.exec(violation);
    if (match) {
        let lineNum = perlDoc.imported.get(match[1]);
        if (typeof lineNum == "undefined") lineNum = 0;
        return { violation, lineNum };
    }
    return;
}

export async function perlcritic(textDocument: TextDocument, workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): Promise<Diagnostic[]> {
    if (!settings.perlcriticEnabled) return [];
    const critic_path = join(await getPerlAssetsPath(), "criticWrapper.pl");
    let criticParams: string[] = [...settings.perlParams, critic_path].concat(getCriticProfile(workspaceFolders, settings));
    criticParams = criticParams.concat(["--file", Uri.parse(textDocument.uri).fsPath]);

    // Add any extra params from settings
    if (settings.perlcriticSeverity) criticParams = criticParams.concat(["--severity", settings.perlcriticSeverity.toString()]);
    if (settings.perlcriticTheme) criticParams = criticParams.concat(["--theme", settings.perlcriticTheme]);
    if (settings.perlcriticExclude) criticParams = criticParams.concat(["--exclude", settings.perlcriticExclude]);
    if (settings.perlcriticInclude) criticParams = criticParams.concat(["--include", settings.perlcriticInclude]);

    nLog("Now starting perlcritic with: " + criticParams.join(" "), settings);
    const code = textDocument.getText();
    const diagnostics: Diagnostic[] = [];
    let output: string;
    try {
        const process = async_execFile(settings.perlPath, criticParams, { timeout: 25000 });
        process?.child?.stdin?.on("error", (error: any) => {
            nLog("Perl Critic Error Caught: ", settings);
            nLog(error, settings);
        });
        process?.child?.stdin?.write(code);
        process?.child?.stdin?.end();
        const out = await process;
        output = out.stdout;
    } catch (error: any) {
        nLog("Perlcritic failed with unknown error", settings);
        nLog(error, settings);
        return diagnostics;
    }

    nLog("Critic output: " + output, settings);
    output.split("\n").forEach((violation) => {
        maybeAddCriticDiag(violation, diagnostics, settings);
    });

    return diagnostics;
}

export async function perlimports(textDocument: TextDocument, workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): Promise<Diagnostic[]> {
    if (!settings.perlimportsLintEnabled) return [];
    const importsPath = join(await getPerlAssetsPath(), "perlimportsWrapper.pl");
    const cliParams = [...settings.perlParams, importsPath, ...getPerlimportsProfile(workspaceFolders, settings), "--lint", "--json", "--filename", Uri.parse(textDocument.uri).fsPath];

    nLog("Now starting perlimports with: " + cliParams.join(" "), settings);
    const code = textDocument.getText();
    const diagnostics: Diagnostic[] = [];
    let output: string;
    try {
        const process = async_execFile(settings.perlPath, cliParams, { timeout: 25000 });
        process?.child?.stdin?.on("error", (error: any) => {
            nLog("perlimports Error Caught: " + error, settings);
        });
        process?.child?.stdin?.write(code);
        process?.child?.stdin?.end();
        const out = await process;
        output = out.stdout;
    } catch (error: any) {
        nLog("Attempted to run perlimports lint: " + error.stdout, settings);
        output = error.message;
    }

    // The first line will be an error message about perlimports failing.
    // The last line may be blank.
    output
        .split("\n")
        .filter((v) => v.startsWith("{"))
        .forEach((violation) => {
            maybeAddPerlImportsDiag(violation, diagnostics, settings);
        });

    return diagnostics;
}

function getCriticProfile(workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): string[] {
    let profileCmd: string[] = [];
    if (settings.perlcriticProfile) {
        let profile = settings.perlcriticProfile;
        if (profile.indexOf("$workspaceFolder") != -1) {
            if (workspaceFolders) {
                // TODO: Fix this too. Only uses the first workspace folder
                const workspaceUri = Uri.parse(workspaceFolders[0].uri).fsPath;
                profileCmd.push("--profile");
                profileCmd.push(profile.replaceAll("$workspaceFolder", workspaceUri));
            } else {
                nLog("You specified $workspaceFolder in your perlcritic path, but didn't include any workspace folders. Ignoring profile.", settings);
            }
        } else {
            profileCmd.push("--profile");
            profileCmd.push(profile);
        }
    }
    return profileCmd;
}

function maybeAddCriticDiag(violation: string, diagnostics: Diagnostic[], settings: NavigatorSettings): void {
    // Severity ~|~ Line ~|~ Column ~|~ Description ~|~ Policy ~||~ Newline
    const tokens = violation.replace("~||~", "").replaceAll("\r", "").split("~|~");
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
            end: { line: line_num, character: col_num + 500 }, // Arbitrarily large
        },
        message: "Critic: " + message,
        source: "perlnavigator",
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
                end: { line: Number(loc.end.line) - 1, character: Number(loc.end.column) - 1 },
            },
            severity: DiagnosticSeverity.Warning,
            source: "perlnavigator",
        });
    } catch (error: any) {
        nLog(`Could not parse JSON violation ${error}`, settings);
    }
}

function getCriticDiagnosticSeverity(severity_num: string, settings: NavigatorSettings): DiagnosticSeverity | undefined {
    // Unknown severity gets max (should never happen)
    const severity_config =
        severity_num == "1"
            ? settings.severity1
            : severity_num == "2"
            ? settings.severity2
            : severity_num == "3"
            ? settings.severity3
            : severity_num == "4"
            ? settings.severity4
            : settings.severity5;

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

function mergeDocs(doc1: PerlDocument, doc2: PerlDocument) {
    // TODO: Redo this code. Instead of merging sources, you should keep track of where symbols came from

    doc1.autoloads = new Map([...doc1.autoloads, ...doc2.autoloads]);
    doc1.canonicalElems = new Map([...doc1.canonicalElems, ...doc2.canonicalElems]);

    // TODO: Should elems be merged? Probably. Or tagged doc and compilation results are totally split
    doc1.elems = new Map([...doc2.elems, ...doc1.elems]); // Tagged docs have priority?
    doc1.imported = new Map([...doc1.imported, ...doc2.imported]);
    doc1.parents = new Map([...doc1.parents, ...doc2.parents]);
    doc1.uri = doc2.uri;

    return doc1;
}
