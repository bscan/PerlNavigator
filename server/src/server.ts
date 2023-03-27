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
    Location,
    WorkspaceFolder,
    CompletionItem,
    CompletionList,
	TextDocumentPositionParams,
    TextEdit
} from 'vscode-languageserver/node';
import { basename } from 'path';
import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import {
    PublishDiagnosticsParams
} from 'vscode-languageserver-protocol';

import Uri from 'vscode-uri';
import { perlcompile, perlcritic, perlimports } from "./diagnostics";
import { cleanupTemporaryAssetPath } from "./assets";
import { getDefinition, getAvailableMods } from "./navigation";
import { getSymbols, getWorkspaceSymbols } from "./symbols";
import { NavigatorSettings, PerlDocument, PerlElem } from "./types";
import { getHover } from "./hover";
import { getCompletions } from './completion';
import { formatDoc, formatRange } from "./formatting";
import { nLog } from './utils';
import { startProgress, endProgress } from './progress';
var LRU = require("lru-cache");
// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;

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

    const result: InitializeResult = {
        capabilities: {
            textDocumentSync: TextDocumentSyncKind.Incremental,

            completionProvider: {
                resolveProvider: false,
                triggerCharacters: ['$','@','%','-', '>',':']
            },

            definitionProvider: true, // goto definition
            documentSymbolProvider: true, // Outline view and breadcrumbs
            workspaceSymbolProvider: true, 
            hoverProvider: true, 
            documentFormattingProvider: true, 
            documentRangeFormattingProvider: true, 
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
});


// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Does not happen with the vscode client could happen with other clients.
// The "real" default settings are in the top-level package.json
const defaultSettings: NavigatorSettings = {
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
    perlimportsLintEnabled: false,
    perlimportsTidyEnabled: false,
    perltidyEnabled: true,
    severity5: "warning",
    severity4: "info",
    severity3: "hint",
    severity2: "hint",
    severity1: "hint",
    includePaths: [],
    includeLib: true,
    logging: false, // Get logging from vscode, but turn it off elsewhere. Sublime Text seems to struggle with it on Windows
    enableProgress: false,
};

let globalSettings: NavigatorSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, NavigatorSettings> = new Map();

// Store recent critic diags to prevent blinking of diagnostics
const documentDiags: Map<string, Diagnostic[]> = new Map();

// My ballpark estimate is that 350k symbols will be about 35MB. Huge map, but a reasonable limit. 
const navSymbols = new LRU({max: 350000, length: function (value:PerlDocument , key:string) { return value.elems.size }});

const timers: Map<string, NodeJS.Timeout> = new Map();

// Keep track of modules available for import. Building this is a slow operations and varies based on workspace settings, not documents
const availableMods: Map<string, Map<string, string>> = new Map();
let modCacheBuilt: boolean = false;


async function rebuildModCache(){
    const allDocs = documents.all();
    if (allDocs.length > 0){
        modCacheBuilt = true;
        dispatchForMods(allDocs[allDocs.length-1]); // Rebuild with recent file
    }
    return;
}

async function buildModCache(textDocument: TextDocument){
    if(!modCacheBuilt){
        modCacheBuilt = true; // Set true first to prevent other files from building concurrently.
        dispatchForMods(textDocument); 
    }
    return;
}

async function dispatchForMods(textDocument: TextDocument) {
    // BIG TODO: Resolution of workspace settings? How to do? Maybe build a hash of all include paths.
    const settings = await getDocumentSettings(textDocument.uri);
    const workspaceFolders = await getWorkspaceFoldersSafe(); 
    const newMods = await getAvailableMods(workspaceFolders, settings);
    availableMods.set('default', newMods);
    return;
}

async function getWorkspaceFoldersSafe (): Promise<WorkspaceFolder[]> {
    try {
        const workspaceFolders = await connection.workspace.getWorkspaceFolders(); 
        if (!workspaceFolders){
            return [];
        } else {
            return workspaceFolders;
        }
    } catch (error) {
        return [];
    }
}

async function getDocumentSettings(resource: string): Promise<NavigatorSettings> {
    if (!hasConfigurationCapability) {
        return globalSettings;
    }
    let result = documentSettings.get(resource);
    if (!result) {
        result = await connection.workspace.getConfiguration({
            scopeUri: resource,
            section: 'perlnavigator'
        });
        if(!result) return globalSettings;
        const resolvedSettings = { ...globalSettings, ...result };
        documentSettings.set(resource, resolvedSettings);
        return resolvedSettings;
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
    const timer = timers.get(change.document.uri)
    if(timer) clearTimeout(timer);
    const newTimer = setTimeout(function(){ validatePerlDocument(change.document)}, 1000);
    timers.set(change.document.uri, newTimer);
});


async function validatePerlDocument(textDocument: TextDocument): Promise<void> {

    const filePath = Uri.parse(textDocument.uri).fsPath;
    const fileName = basename(filePath);

    const settings = await getDocumentSettings(textDocument.uri);
    nLog("Found settings", settings);

    const progressToken = navSymbols.has(textDocument.uri) ? null : await startProgress(connection, `Initializing ${fileName}`, settings);

    
    const start = Date.now();

    const workspaceFolders = await getWorkspaceFoldersSafe(); 
    const pCompile = perlcompile(textDocument, workspaceFolders, settings); // Start compilation
    const pCritic = perlcritic(textDocument, workspaceFolders, settings); // Start perlcritic
    const pImports = perlimports(textDocument, workspaceFolders, settings); // Start perlimports

    let perlOut = await pCompile;
    nLog("Compilation Time: " + (Date.now() - start)/1000 + " seconds", settings);
    let oldCriticDiags = documentDiags.get(textDocument.uri);
    if(!perlOut){
        endProgress(connection, progressToken);
        return;
    }
        let mixOldAndNew = perlOut.diags;
    if(oldCriticDiags && settings.perlcriticEnabled) {
        // Resend old critic diags to avoid overall file "blinking" in between receiving compilation and critic. TODO: async wait if it's not that long.
        mixOldAndNew = perlOut.diags.concat(oldCriticDiags);
    }     
    sendDiags({ uri: textDocument.uri, diagnostics: mixOldAndNew });

    navSymbols.set(textDocument.uri, perlOut.perlDoc);

    // Perl critic things
    const diagCritic = await pCritic;
    const diagImports = await pImports;
    let newDiags: Diagnostic[] = [];


    if(settings.perlcriticEnabled){
        newDiags = newDiags.concat(diagCritic);
        nLog("Perl Critic Time: " + (Date.now() - start)/1000 + " seconds", settings);
    }

    if(settings.perlimportsLintEnabled){
        newDiags = newDiags.concat(diagImports);
        nLog(`perlimports Time: ${(Date.now() - start) / 1000} seconds`, settings);
    }

    documentDiags.set(textDocument.uri, newDiags); // May need to clear out old ones if a user changed their settings.

    if(newDiags){
        const allNewDiags = perlOut.diags.concat(newDiags);
        sendDiags({ uri: textDocument.uri, diagnostics: allNewDiags });
    }
    endProgress(connection, progressToken);
    return;
}

function sendDiags(params: PublishDiagnosticsParams): void{
    // Before sending new diagnostics, check if the file is still open. 
    if(documents.get(params.uri)){
        connection.sendDiagnostics(params);
    } else {
        connection.sendDiagnostics({ uri: params.uri, diagnostics: [] });
    }
}


connection.onDidChangeConfiguration(async change => {
    if (hasConfigurationCapability) {
        // Reset all cached document settings
        documentSettings.clear();
    } else {
        globalSettings = { ...defaultSettings, ...change?.settings?.perlnavigator };
    }

    if(change?.settings?.perlnavigator){
        // Despite what it looks like, this fires on all settings changes, not just Navigator
        await rebuildModCache();
        for (const doc of documents.all()) {
            // sequential changes
            await validatePerlDocument(doc);
        };
    }
});


// This handler provides the initial list of the completion items.
connection.onCompletion((params: TextDocumentPositionParams): CompletionList | undefined => {
    let document = documents.get(params.textDocument.uri);
    let perlDoc = navSymbols.get(params.textDocument.uri);
    let mods = availableMods.get('default');

    if(!document) return;
    if(!perlDoc) return; // navSymbols is an LRU cache, so the navigation elements will be missing if you open lots of files
    if(!mods) mods = new Map();
    const completions: CompletionItem[] = getCompletions(params, perlDoc, document, mods);
    return {
        items: completions,
        isIncomplete: false,
    };
});


connection.onHover(params => {
    let document = documents.get(params.textDocument.uri);
    let perlDoc = navSymbols.get(params.textDocument.uri);
    let mods = availableMods.get('default');
    if(!mods) mods = new Map();
    
    if(!document || !perlDoc) return;

    return getHover(params, perlDoc, document, mods);
});


connection.onDefinition(params => {
    let document = documents.get(params.textDocument.uri);
    let perlDoc = navSymbols.get(params.textDocument.uri);
    let mods = availableMods.get('default');
    if(!mods) mods = new Map();
    if(!document) return;
    if(!perlDoc) return; // navSymbols is an LRU cache, so the navigation elements will be missing if you open lots of files
    let locOut: Location | Location[] | undefined = getDefinition(params, perlDoc, document, mods);
    return locOut;
});


connection.onDocumentSymbol(params => {
    return getSymbols(navSymbols, params.textDocument.uri);
});


connection.onWorkspaceSymbol(params => {
    let defaultMods = availableMods.get('default');
    if(!defaultMods) return;
    return getWorkspaceSymbols(params, defaultMods);
});


connection.onDocumentFormatting(async params => {
    let document = documents.get(params.textDocument.uri);
    let settings = documentSettings.get(params.textDocument.uri); 
    const workspaceFolders = await getWorkspaceFoldersSafe(); 

    if(!document || !settings) return;
    const editOut: TextEdit[] | undefined = await formatDoc(params, document, settings, workspaceFolders, connection);
    return editOut;
});


connection.onDocumentRangeFormatting(async params => {
    let document = documents.get(params.textDocument.uri);
    let settings = documentSettings.get(params.textDocument.uri); 
    const workspaceFolders = await getWorkspaceFoldersSafe(); 

    if(!document || !settings) return;
    const editOut: TextEdit[] | undefined = await formatRange(params, document, settings, workspaceFolders, connection);
    return editOut;
});

connection.onShutdown((handler) => {
    try {
        cleanupTemporaryAssetPath();
    } catch (error) {
    }
});

process.on('unhandledRejection', function(reason, p){
    console.log("Caught an unhandled Rejection at: Promise ", p, " reason: ", reason);
});


// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
