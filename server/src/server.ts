/* Perl Navigator server. See licenses.txt file for licensing and copyright information */

import {
    createConnection,
    TextDocuments,
    Diagnostic,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    TextDocumentSyncKind,
    InitializeResult
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';

import Uri from 'vscode-uri';
import { exec } from 'child_process';
import { getPerlDiagnostics, getCriticDiagnostics } from "./diagnostics";
import { NavigatorSettings } from "./types";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(
        capabilities.workspace && !!capabilities.workspace.configuration
    );
    hasWorkspaceFolderCapability = !!(
        capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    hasDiagnosticRelatedInformationCapability = !!(
        capabilities.textDocument &&
        capabilities.textDocument.publishDiagnostics &&
        capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,
        }
    };
    if (hasWorkspaceFolderCapability) {
        result.capabilities.workspace = {
            workspaceFolders: {
                supported: true
            }
        };
    }
    return result;
});

connection.onInitialized(() => {
    if (hasConfigurationCapability) {
        // Register for all configuration changes.
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            connection.console.log('Workspace folder change event received.');
        });
    }
});

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
// The "real" default settings are in the top-level package.json
const defaultSettings: NavigatorSettings = {
    perlPath: "perl",
    enableAllWarnings: false,
    perlcriticPath: "perlcritic",
    perlcriticProfile: "",
    severity5: "warning",
    severity4: "hint",
    severity3: "hint",
    severity2: "hint",
    severity1: "hint",
};

let globalSettings: NavigatorSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<NavigatorSettings>> = new Map();

connection.onDidChangeConfiguration(change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = <NavigatorSettings>(
            (change.settings.perlnavigator || defaultSettings)
        );
    }
    // Revalidate all open text documents
    documents.all().forEach(validatePerlDocument);
});

function getDocumentSettings(resource: string): Thenable<NavigatorSettings> {
    if (!hasConfigurationCapability) {
        return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'perlnavigator'
        });
        documentSettings.set(resource, result);
    }
    return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
});

// The document has been opened.
documents.onDidOpen(change => {
    validatePerlDocument(change.document);
});

documents.onDidSave(change => {
    validatePerlDocument(change.document);
});


async function validatePerlDocument(textDocument: TextDocument): Promise<void> {
    const settings = await getDocumentSettings(textDocument.uri);
    const filePath = Uri.parse(textDocument.uri).fsPath;
    const commandSwitch = (settings.enableAllWarnings ? " -cw " : " -c ");

    let criticSwitch = " --verbose" + ' "%s~|~%l~|~%c~|~%m~|~%p~||~%n" ';
    if (settings.perlcriticProfile) {
        criticSwitch += " --profile " + settings.perlcriticProfile;
    }

    let perlDiags: Diagnostic[] = [];
    const compCmd = settings.perlPath + commandSwitch + '"' + filePath + '"';
    connection.console.log("\t\tRunning perl compilation check with: " + compCmd);
    exec(compCmd, process.env,
        (_error, _stdout, stderr) => {
            if (stderr) {
                connection.console.log("Compilation stderr: " + stderr);
                perlDiags = perlDiags.concat(getPerlDiagnostics(stderr));
            }

            const criticCmd = settings.perlcriticPath + ' "' + filePath + '"' + criticSwitch; 
            connection.console.log("Now running perlcritic with: " + criticCmd);
            exec(criticCmd,  process.env,
                (_error, stdout, stderr) => {
                    connection.console.log("Critic stderr: " + stderr);

                    if (stdout) {
                        perlDiags = perlDiags.concat(getCriticDiagnostics(stdout, settings));
                    }
                    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics: perlDiags });
                }
            );
        }
    );
}


connection.onDidChangeWatchedFiles(_change => {
            // Monitored files have change in VSCode
            connection.console.log('We received an file change event');
        });

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
