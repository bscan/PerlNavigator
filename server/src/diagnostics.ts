import {
    Diagnostic,
    DiagnosticSeverity,
} from 'vscode-languageserver/node';
import { NavigatorSettings } from "./types";

// These functions grabbed from Perl-Toolbox
export function getPerlDiagnostics(output: string): Diagnostic[] {
    // connection.console.log("Building Diagnostics");
    const diagnostics: Diagnostic[] = [];

    let severity: DiagnosticSeverity ;

    if(output.includes('syntax OK')){
        // To my knowledge, Perl doesn't differentiate warnings vs errors (unless we add -Mdiagnostics) so we can't figure out which is which
        // If there's one error then mark them all as errors, so the File information will at least be correct
        severity = DiagnosticSeverity.Warning;
    } else {
        severity = DiagnosticSeverity.Error;
    }

    output.split("\n").forEach(violation => {
        // connection.console.log("\tChecking violation: " + violation);
        maybeAddDiag(violation, severity, diagnostics);
    });
    return diagnostics;
}

function maybeAddDiag(violation: string, severity: DiagnosticSeverity , diagnostics: Diagnostic[]): void {

    const patt = /at\s+(?:.+)\s+line\s+(\d+)/i;
    const match = patt.exec(violation);

    if(!match){
        return;
    }
    const line_num = +match[1] - 1;

    // connection.console.log("\tFound a new violation");

    diagnostics.push({
        severity: severity,
        range: {
            start: { line: line_num, character: 0 },
            end: { line: line_num, character: 500 }
        },
        message: "Syntax: " + violation,
        source: 'perlnavigator'
    });
}

export function getCriticDiagnostics(output: string, settings: NavigatorSettings): Diagnostic[] {
    // connection.console.log("Building Diagnostics");
    const diagnostics: Diagnostic[] = [];

    output.split("\n").forEach(violation => {
        // connection.console.log("\tChecking critic: " + violation);
        maybeAddCriticDiag(violation, diagnostics, settings);
    });
    return diagnostics;
}

function maybeAddCriticDiag(violation: string, diagnostics: Diagnostic[], settings: NavigatorSettings): void {

    // Severity ~|~ Line ~|~ Column ~|~ Description ~|~ Policy ~||~ Newline
    const tokens = violation.replace("~||~", "").split("~|~");
    if(tokens.length != 5){
        return;
    }
    const line_num = +tokens[1] - 1;
    const message = tokens[3] + " (" + tokens[4] + ", Severity: " + tokens[0] + ")";
    // connection.console.log("\tFound a new critic");
    const severity = getCriticDiagnosticSeverity(tokens[0], settings);
    if(!severity){
        return;
    }
    diagnostics.push({
        severity: severity,
        range: {
            start: { line: line_num, character: 0 },
            end: { line: line_num, character: 500 }
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