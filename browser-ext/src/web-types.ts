// Settings for perlnavigator,
// defaults for configurable editors stored in package.json
// defaults for non-configurable editors in server.ts

import {
    Diagnostic,
} from 'vscode-languageserver/browser';



export interface NavigatorSettings {
    perlPath: string;
    enableWarnings: boolean;
    perlcriticProfile: string;
    perlcriticEnabled: boolean;
    perlcriticSeverity: undefined | number;
    perlcriticTheme: undefined | string;
    perlcriticExclude: undefined | string;
    perlcriticInclude: undefined | string;
    perlimportsLintEnabled: boolean;
    perlimportsTidyEnabled: boolean;
    perlimportsProfile: string;
    perltidyEnabled: boolean;
    perltidyProfile: string;
    severity5: string;
    severity4: string;
    severity3: string;
    severity2: string;
    severity1: string;
    includePaths: string[];
    includeLib: boolean;
    logging: boolean;
    enableProgress: boolean;
}



export interface PerlElem {
    name: string,
    type: PerlSymbolKind,
    typeDetail: string,
    file: string;
    package: string;
    line: number;
    lineEnd: number;
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
    parents: Map<string, string>;
    filePath: string;
    uri: string;
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

export enum PerlSymbolKind {
    Module       = "m",
    Package      = "p",
    Class        = "a",
    Role         = "b",
    ImportedSub  = "t",
    Inherited    = "i",
    Field        = "f", // Instance fields
    PathedField  = "d", // Instance fields
    LocalSub     = "s", 
    LocalMethod  = "o", // Assumed to be instance methods
    Method       = "x", // Assumed to be instance methods
    LocalVar     = "v",
    Constant     = "n",
    Label        = "l",
    Phaser       = "e",
    Canonical    = "1",
    // UseStatement = "u", // Reserved: used in pltags, but removed before symbol assignment.
    ImportedVar  = "c",
    ImportedHash = "h",
}

