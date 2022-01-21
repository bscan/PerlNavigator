// Settings for perlnavigator,
// defaults for configurable editors stored in package.json
// defaults for non-configurable editors in server.ts

import {
    Diagnostic,
} from 'vscode-languageserver/node';



export interface NavigatorSettings {
    perlPath: string;
    enableWarnings: boolean;
    perlcriticPath: string;
    perlcriticProfile: string;
    severity5: string;
    severity4: string;
    severity3: string;
    severity2: string;
    severity1: string;
    includePaths: string[];
}



export interface PerlElem {
    type: string;
    file: string;
    module: string;
    line: number;
    value: string;
};

export interface PerlDocument {
    elems: Map<string, PerlElem>;
}

export interface DiagnosedDoc {
    diags: Diagnostic[],
    rawTags: string,
}