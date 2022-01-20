/* Perl Navigator server. See licenses.txt file for licensing and copyright information */

import {
    createConnection,
    TextDocuments,
    Diagnostic,
    ProposedFeatures,
    InitializeParams,
    DidChangeConfigurationNotification,
    TextDocumentSyncKind,
    InitializeResult,
    DidChangeWatchedFilesNotification,
	DidChangeWatchedFilesRegistrationOptions,
    WatchKind
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import {
	PublishDiagnosticsParams
} from 'vscode-languageserver-protocol';

import Uri from 'vscode-uri';
import { perlcompile, perlcritic } from "./diagnostics";
import { NavigatorSettings } from "./types";

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;
let hasDidChangeWatchedFilesCapability = false;

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

    hasDidChangeWatchedFilesCapability = !!(
		capabilities.workspace && !! capabilities.workspace.didChangeWatchedFiles?.dynamicRegistration
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

    // if(hasDidChangeWatchedFilesCapability) {	
    // You'll need manually to add and remove all watched files. Is there an example of someone doing this? Seems like it would be common....
	// 	const option : DidChangeWatchedFilesRegistrationOptions = {watchers: [{globPattern: '**/*.pl', kind: WatchKind.Change} ]};
	// 	connection.client.register(DidChangeWatchedFilesNotification.type, option);
	// }
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
    includePaths: [],
};

let globalSettings: NavigatorSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<NavigatorSettings>> = new Map();

// Store recent critic diags to prevent blinking of diagnostics
const documentDiags: Map<string, Diagnostic[]> = new Map();

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
    documentDiags.delete(e.document.uri);
    connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

// The document has been opened.
documents.onDidOpen(change => {
    validatePerlDocument(change.document);
});

documents.onDidSave(change => {
    validatePerlDocument(change.document);
});


// TODO: Currently, we aren't monitoring files that change under our feet (e.g from git pull)
// connection.onDidChangeWatchedFiles(change => {
//     // Monitored files have change in VSCode
//     change.changes.forEach(element => {
//         // Need to check for folders, etc.
//         let changedDoc: TextDocument = {uri: element.uri};
//         validatePerlDocument(changedDoc);
//     });
//     connection.console.log('We received an file change event');
// });


async function validatePerlDocument(textDocument: TextDocument): Promise<void> {
    const settings = await getDocumentSettings(textDocument.uri);
    const filePath = Uri.parse(textDocument.uri).fsPath;
    
    const start = Date.now();

    const workspaceFolders = await connection.workspace.getWorkspaceFolders(); 
    const pCompile = perlcompile(filePath, workspaceFolders, settings); // Start compilation
    const pCritic = perlcritic(filePath, workspaceFolders, settings); // Start perlcritic

    let diagPerl = await pCompile;
    connection.console.log("Compilation Time: " + (Date.now() - start)/1000 + " seconds");
    let allDiags = documentDiags.get(textDocument.uri);
    let mixOldAndNew = diagPerl;
    if(allDiags) {
        // Resend old critic diags to avoid overall file "blinking" in between receiving compilation and critic
        mixOldAndNew = diagPerl.concat(allDiags);
    }     
    sendDiags({ uri: textDocument.uri, diagnostics: mixOldAndNew });

    const diagCritic = await pCritic;
    documentDiags.set(textDocument.uri, diagCritic);
    const allNewDiags = diagPerl.concat(diagCritic);
    connection.console.log("Perl Critic Time: " + (Date.now() - start)/1000 + " seconds");
    sendDiags({ uri: textDocument.uri, diagnostics: allNewDiags });

    return;
}

function sendDiags(params: PublishDiagnosticsParams): void{
    // Before sending new diagnostics, check if the file is still open. 
    if(documentSettings.has(params.uri)){
        connection.sendDiagnostics(params);
    } else {
        connection.console.log("Another test message");
        console.log("The file has already closed. Skipping diagnostics");
    }
}



// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
