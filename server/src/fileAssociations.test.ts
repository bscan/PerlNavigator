import { test } from "node:test";
import { strict as assert } from "node:assert";
import { resolve } from "path";
import { WorkspaceFolder } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import Uri from "vscode-uri";

import { applyAssociatedFileSymbols, parseFileAssociations, resolveAssociatedFileUris } from "./fileAssociations";
import { parseDocument } from "./parser";
import { NavigatorSettings, ParseType } from "./types";
import { lookupSymbol } from "./utils";

const repoRoot = resolve(__dirname, "../..");
const associatedDefaultsPath = resolve(repoRoot, "testWorkspace", "AssociatedDefaults.pl");
const workspaceFolder: WorkspaceFolder = {
    name: "testWorkspace",
    uri: Uri.file(repoRoot).toString(),
};

const settings: NavigatorSettings = {
    perlPath: "perl",
    perlParams: [],
    enableWarnings: true,
    perlimportsProfile: "",
    perltidyProfile: "",
    perlcriticProfile: "",
    perlcriticEnabled: true,
    perlcriticSeverity: undefined,
    perlcriticTheme: undefined,
    perlcriticExclude: undefined,
    perlcriticInclude: undefined,
    perlcriticMessageFormat: "%m",
    perlimportsLintEnabled: false,
    perlimportsTidyEnabled: false,
    perltidyEnabled: true,
    perlCompileEnabled: true,
    perlEnv: undefined,
    perlEnvAdd: true,
    severity5: "warning",
    severity4: "info",
    severity3: "hint",
    severity2: "hint",
    severity1: "hint",
    includePaths: [],
    includeLib: true,
    logging: false,
    enableProgress: false,
};

function createDocument(fileName: string, text: string): TextDocument {
    return TextDocument.create(Uri.file(resolve(repoRoot, fileName)).toString(), "perl", 1, text);
}

test("parseFileAssociations accepts string arrays", () => {
    const fileAssociations = parseFileAssociations({
        perlnavigator: {
            fileAssociations: {
                ".latexmkrc": ["testWorkspace/AssociatedDefaults.pl"],
            },
        },
    });

    assert.deepEqual(fileAssociations.get(".latexmkrc"), ["testWorkspace/AssociatedDefaults.pl"]);
});

test("resolveAssociatedFileUris matches by basename and resolves relative paths from workspace", async () => {
    const fileAssociations = parseFileAssociations({
        perlnavigator: {
            fileAssociations: {
                ".latexmkrc": ["testWorkspace/AssociatedDefaults.pl"],
            },
        },
    });
    const document = createDocument(".latexmkrc", "$out_dir = 'build';\n");

    const associatedUris = await resolveAssociatedFileUris(document, fileAssociations, [workspaceFolder], settings);

    assert.deepEqual(associatedUris, [Uri.file(associatedDefaultsPath).toString()]);
});

test("applyAssociatedFileSymbols adds fallback symbols for associated config files", async () => {
    const fileAssociations = parseFileAssociations({
        perlnavigator: {
            fileAssociations: {
                ".latexmkrc": ["testWorkspace/AssociatedDefaults.pl"],
            },
        },
    });
    const document = createDocument(".latexmkrc", "$show_time = 1;\nadd_cus_dep('glo', 'gls', 0, 'makeglossaries');\n");
    const parsedDocument = await parseDocument(document, ParseType.selfNavigation);

    const mergedDocument = await applyAssociatedFileSymbols(parsedDocument, document, fileAssociations, [workspaceFolder], settings);

    assert.ok(mergedDocument.elems.has("$out_dir"));
    assert.ok(mergedDocument.elems.has("$show_time"));
    assert.ok(mergedDocument.elems.has("@default_files"));
    assert.ok(mergedDocument.elems.has("add_cus_dep"));

    const outDirSymbol = lookupSymbol(mergedDocument, new Map(), "$out_dir", 0);
    const customDepSymbol = lookupSymbol(mergedDocument, new Map(), "add_cus_dep", 1);

    assert.equal(outDirSymbol[0]?.uri, Uri.file(associatedDefaultsPath).toString());
    assert.equal(customDepSymbol[0]?.uri, Uri.file(associatedDefaultsPath).toString());
});

test("applyAssociatedFileSymbols keeps current document definitions ahead of fallback symbols", async () => {
    const fileAssociations = parseFileAssociations({
        perlnavigator: {
            fileAssociations: {
                ".latexmkrc": ["testWorkspace/AssociatedDefaults.pl"],
            },
        },
    });
    const document = createDocument(".latexmkrc", "our $out_dir = 'build';\n");
    const parsedDocument = await parseDocument(document, ParseType.selfNavigation);

    const mergedDocument = await applyAssociatedFileSymbols(parsedDocument, document, fileAssociations, [workspaceFolder], settings);
    const outDirSymbol = lookupSymbol(mergedDocument, new Map(), "$out_dir", 0);

    assert.equal(outDirSymbol[0]?.uri, document.uri);
});
