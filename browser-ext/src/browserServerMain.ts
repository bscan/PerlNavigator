/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createConnection, BrowserMessageReader, BrowserMessageWriter, SymbolInformation, SymbolKind, CompletionList, TextDocumentPositionParams, CompletionItem, Hover, Location } from 'vscode-languageserver/browser';

import { Color, ColorInformation, Range, InitializeParams, InitializeResult, ServerCapabilities, TextDocuments, ColorPresentation, TextEdit, TextDocumentIdentifier } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem } from "./web-types";
import { buildNav } from "./web-parse";

import { getDefinition } from "./web-navigation";
import { getSymbols } from "./web-symbols";
import { getHover } from "./web-hover";
import { getCompletions } from './web-completion';

var LRU = require("lru-cache");


console.log('running server perl-navigator web');

/* browser specific setup code */

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(messageReader, messageWriter);

// My ballpark estimate is that 350k symbols will be about 35MB. Huge map, but a reasonable limit. 
const navSymbols = new LRU({max: 350000, length: function (value:PerlDocument , key:string) { return value.elems.size }});
const timers: Map<string, ReturnType<typeof setTimeout>> = new Map();


/* from here on, all code is non-browser specific and could be shared with a regular extension */

connection.onInitialize((params: InitializeParams): InitializeResult => {
	const capabilities: ServerCapabilities = {
		completionProvider: {
			resolveProvider: false,
			triggerCharacters: ['$','@','%','-', '>',':']
		},

		definitionProvider: true, // goto definition
		documentSymbolProvider: true, // Outline view and breadcrumbs
		hoverProvider: true, 
	};
	return { capabilities };
});


// Track open, change and close text document events
const documents = new TextDocuments(TextDocument);
documents.listen(connection);

// Listen on the connection
connection.listen();


// Only keep symbols for open documents
documents.onDidClose(e => {
    navSymbols.del(e.document.uri);
});


documents.onDidOpen(change => {
    validatePerlDocument(change.document);
});


documents.onDidSave(change => {
    validatePerlDocument(change.document);
});

documents.onDidChangeContent(change => {
    // VSCode sends a firehose of change events.
    // Only check after it's been quiet for 0.25 seconds (web mode is faster because it doesn't recompile).
    const timer = timers.get(change.document.uri)
    if(timer) clearTimeout(timer);
    const newTimer: ReturnType<typeof setTimeout> = setTimeout(function(){ validatePerlDocument(change.document)}, 250);
    timers.set(change.document.uri, newTimer);
});


async function validatePerlDocument(textDocument: TextDocument): Promise<void> {
	// console.log("Rebuilding symbols for " + textDocument.uri + "");
    const perlDoc = await buildNav(textDocument);
    navSymbols.set(textDocument.uri, perlDoc);
    return;

}


connection.onDocumentSymbol(params => {
    return getSymbols(navSymbols, params.textDocument.uri);
});

// This handler provides the initial list of the completion items.
connection.onCompletion((params: TextDocumentPositionParams): CompletionList | undefined => {

    let document = documents.get(params.textDocument.uri);
    let perlDoc = navSymbols.get(params.textDocument.uri);
    if(!document || !perlDoc) return;

    const completions: CompletionItem[] = getCompletions(params, perlDoc, document);

    return {
        items: completions,
        isIncomplete: false,
    };
});


connection.onHover(params => {
    let document = documents.get(params.textDocument.uri);
    let perlDoc = navSymbols.get(params.textDocument.uri);
    if(!document || !perlDoc) return;

    return getHover(params, perlDoc, document);
});


connection.onDefinition(params => {
    let document = documents.get(params.textDocument.uri);
    let perlDoc = navSymbols.get(params.textDocument.uri);
	if(!document || !perlDoc) return;

    let locOut: Location | Location[] | undefined = getDefinition(params, perlDoc, document);
    return locOut;
});
