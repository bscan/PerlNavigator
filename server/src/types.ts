// Settings for perlnavigator,
// defaults for configurable editors stored in package.json
// defaults for non-configurable editors in server.ts

import {
    Diagnostic,
} from 'vscode-languageserver/node';



export interface NavigatorSettings {
    perlPath: string;
    enableWarnings: boolean;
    perlcriticProfile: string;
    perlcriticEnabled: boolean;
    severity5: string;
    severity4: string;
    severity3: string;
    severity2: string;
    severity1: string;
    includePaths: string[];
}



export interface PerlElem {
    name: string,
    type: string;
    typeDetail: string,
    file: string;
    package: string;
    line: number;
    value: string;
};

// Used for keeping track of what has been imported
export interface PerlImport {
    mod: string;
};


export interface PerlDocument {
    elems: Map<string, PerlElem[]>;
    canonicalElems: Map<string, PerlElem>;
    imported: Map<string, number>;
}

export interface CompilationResults {
    diags: Diagnostic[],
    perlDoc: PerlDocument,
}

export interface CompletionPrefix {
    symbol: string,
    charStart: number,
    charEnd: number,
}