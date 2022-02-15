"use strict";
/* Perl Navigator server. See licenses.txt file for licensing and copyright information */
Object.defineProperty(exports, "__esModule", { value: true });
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
const vscode_uri_1 = require("vscode-uri");
const diagnostics_1 = require("./diagnostics");
const navigation_1 = require("./navigation");
const symbols_1 = require("./symbols");
const hover_1 = require("./hover");
const completion_1 = require("./completion");
const utils_1 = require("./utils");
var LRU = require("lru-cache");
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
// Create a simple text document manager.
const documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
connection.onInitialize((params) => {
    const capabilities = params.capabilities;
    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
    const result = {
        capabilities: {
            textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
            completionProvider: {
                resolveProvider: false,
                triggerCharacters: ['$', '@', '%', '-', '>', ':']
            },
            definitionProvider: true,
            documentSymbolProvider: true,
            workspaceSymbolProvider: true,
            hoverProvider: true,
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
        connection.client.register(node_1.DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
        connection.workspace.onDidChangeWorkspaceFolders(_event => {
            // connection.console.log('Workspace folder change event received.');
        });
    }
});
// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Does not happen with the vscode client could happen with other clients.
// The "real" default settings are in the top-level package.json
const defaultSettings = {
    perlPath: "perl",
    enableWarnings: true,
    perlcriticProfile: "",
    perlcriticEnabled: true,
    severity5: "warning",
    severity4: "info",
    severity3: "hint",
    severity2: "hint",
    severity1: "hint",
    includePaths: [],
    logging: false, // Get logging from vscode, but turn it off elsewhere. Sublime Text seems to struggle with it on Windows
};
let globalSettings = defaultSettings;
// Cache the settings of all open documents
const documentSettings = new Map();
// Store recent critic diags to prevent blinking of diagnostics
const documentDiags = new Map();
// My ballpark estimate is that 350k symbols will be about 35MB. Huge map, but a reasonable limit. 
const navSymbols = new LRU({ max: 350000, length: function (value, key) { return value.elems.size; } });
const timers = new Map();
// Keep track of modules available for import. Building this is a slow operations and varies based on workspace settings, not documents
const availableMods = new Map();
let modCacheBuilt = false;
async function rebuildModCache() {
    const allDocs = documents.all();
    if (allDocs.length > 0) {
        modCacheBuilt = true;
        dispatchForMods(allDocs[allDocs.length - 1]); // Rebuild with recent file
    }
    return;
}
async function buildModCache(textDocument) {
    if (!modCacheBuilt) {
        modCacheBuilt = true; // Set true first to prevent other files from building concurrently.
        dispatchForMods(textDocument);
    }
    return;
}
async function dispatchForMods(textDocument) {
    // BIG TODO: Resolution of workspace settings? How to do? Maybe build a hash of all include paths.
    const settings = await getDocumentSettings(textDocument.uri);
    const workspaceFolders = await connection.workspace.getWorkspaceFolders();
    const newMods = await (0, navigation_1.getAvailableMods)(workspaceFolders, settings);
    availableMods.set('default', newMods);
    return;
}
async function getDocumentSettings(resource) {
    if (!hasConfigurationCapability) {
        return globalSettings;
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = await connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'perlnavigator'
        });
        if (!result)
            return globalSettings;
        const resolvedSettings = { ...globalSettings, ...result };
        documentSettings.set(resource, resolvedSettings);
    }
    return result;
}
// Only keep settings for open documents
documents.onDidClose(e => {
    documentSettings.delete(e.document.uri);
    documentDiags.delete(e.document.uri);
    navSymbols.del(e.document.uri);
    connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});
documents.onDidOpen(change => {
    validatePerlDocument(change.document);
    buildModCache(change.document);
});
documents.onDidSave(change => {
    validatePerlDocument(change.document);
});
documents.onDidChangeContent(change => {
    // VSCode sends a firehose of change events. Only check after it's been quiet for 1 second.
    const timer = timers.get(change.document.uri);
    if (timer)
        clearTimeout(timer);
    const newTimer = setTimeout(function () { validatePerlDocument(change.document); }, 1000);
    timers.set(change.document.uri, newTimer);
});
async function validatePerlDocument(textDocument) {
    const settings = await getDocumentSettings(textDocument.uri);
    (0, utils_1.nLog)("Found settings", settings);
    const filePath = vscode_uri_1.default.parse(textDocument.uri).fsPath;
    const start = Date.now();
    const workspaceFolders = await connection.workspace.getWorkspaceFolders();
    const pCompile = (0, diagnostics_1.perlcompile)(textDocument, workspaceFolders, settings); // Start compilation
    const pCritic = (0, diagnostics_1.perlcritic)(textDocument, workspaceFolders, settings); // Start perlcritic
    let perlOut = await pCompile;
    (0, utils_1.nLog)("Compilation Time: " + (Date.now() - start) / 1000 + " seconds", settings);
    let oldCriticDiags = documentDiags.get(textDocument.uri);
    if (!perlOut)
        return;
    let mixOldAndNew = perlOut.diags;
    if (oldCriticDiags && settings.perlcriticEnabled) {
        // Resend old critic diags to avoid overall file "blinking" in between receiving compilation and critic. TODO: async wait if it's not that long.
        mixOldAndNew = perlOut.diags.concat(oldCriticDiags);
    }
    sendDiags({ uri: textDocument.uri, diagnostics: mixOldAndNew });
    navSymbols.set(textDocument.uri, perlOut.perlDoc);
    // Perl critic things
    const diagCritic = await pCritic;
    documentDiags.set(textDocument.uri, diagCritic); // May need to clear out old ones if a user changed their settings.
    if (settings.perlcriticEnabled) {
        const allNewDiags = perlOut.diags.concat(diagCritic);
        (0, utils_1.nLog)("Perl Critic Time: " + (Date.now() - start) / 1000 + " seconds", settings);
        sendDiags({ uri: textDocument.uri, diagnostics: allNewDiags });
    }
    return;
}
function sendDiags(params) {
    // Before sending new diagnostics, check if the file is still open. 
    if (documents.get(params.uri)) {
        connection.sendDiagnostics(params);
    }
    else {
        connection.sendDiagnostics({ uri: params.uri, diagnostics: [] });
    }
}
connection.onDidChangeConfiguration(change => {
    var _a;
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    }
    else {
        globalSettings = { ...defaultSettings, ...(_a = change === null || change === void 0 ? void 0 : change.settings) === null || _a === void 0 ? void 0 : _a.perlnavigator };
    }
    rebuildModCache();
    // Pretty rare occurence, and can slow things down. Revalidate all open text documents
    // documents.all().forEach(validatePerlDocument);
});
// This handler provides the initial list of the completion items.
connection.onCompletion((params) => {
    let document = documents.get(params.textDocument.uri);
    let perlDoc = navSymbols.get(params.textDocument.uri);
    let mods = availableMods.get('default');
    if (!document)
        return;
    if (!perlDoc)
        return; // navSymbols is an LRU cache, so the navigation elements will be missing if you open lots of files
    if (!mods)
        mods = new Map();
    const completions = (0, completion_1.getCompletions)(params, perlDoc, document, mods);
    return {
        items: completions,
        isIncomplete: false,
    };
});
connection.onHover(params => {
    let document = documents.get(params.textDocument.uri);
    let perlDoc = navSymbols.get(params.textDocument.uri);
    if (!document || !perlDoc)
        return;
    return (0, hover_1.getHover)(params, perlDoc, document);
});
connection.onDefinition(params => {
    let document = documents.get(params.textDocument.uri);
    let perlDoc = navSymbols.get(params.textDocument.uri);
    if (!document)
        return;
    if (!perlDoc)
        return; // navSymbols is an LRU cache, so the navigation elements will be missing if you open lots of files
    let locOut = (0, navigation_1.getDefinition)(params, perlDoc, document);
    return locOut;
});
connection.onDocumentSymbol(params => {
    return (0, symbols_1.getSymbols)(navSymbols, params.textDocument.uri);
});
connection.onWorkspaceSymbol(params => {
    let defaultMods = availableMods.get('default');
    if (!defaultMods)
        return;
    return (0, symbols_1.getWorkspaceSymbols)(params, defaultMods);
});
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();
//# sourceMappingURL=server.js.map