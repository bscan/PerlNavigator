import {
    SymbolInformation,
    SymbolKind,
    Location,
    WorkspaceSymbolParams
} from 'vscode-languageserver/node';

import {
    TextDocument
} from 'vscode-languageserver-textdocument';

import { ParseType, PerlElem, PerlSymbolKind } from "./web-types";
import { parseDocument } from './web-parse';

export async function getSymbols (textDocument: TextDocument, uri: string ): Promise<SymbolInformation[]> {
    
    let perlDoc = await parseDocument(textDocument, ParseType.outline);

    let symbols: SymbolInformation[] = [];
    perlDoc.elems?.forEach((elements: PerlElem[], elemName: string) => {
        
        elements.forEach(element => {
            let kind: SymbolKind;
            if (element.type == PerlSymbolKind.LocalSub || element.type == PerlSymbolKind.OutlineOnlySub){
                kind = SymbolKind.Function;
            } else if (element.type == PerlSymbolKind.LocalMethod){
                kind = SymbolKind.Method;
            } else if (element.type == PerlSymbolKind.Package){
                kind = SymbolKind.Package;
            } else if (element.type == PerlSymbolKind.Class){
                kind = SymbolKind.Class;
            } else if (element.type == PerlSymbolKind.Role){
                kind = SymbolKind.Interface;
            } else if (element.type == PerlSymbolKind.Field){
                kind = SymbolKind.Field;
            } else if (element.type == PerlSymbolKind.Label){
                kind = SymbolKind.Key;
            } else if (element.type == PerlSymbolKind.Phaser){
                kind = SymbolKind.Event;
            } else if (element.type == PerlSymbolKind.Constant){
                kind = SymbolKind.Constant;
            } else if (element.type == PerlSymbolKind.HttpRoute){
                kind = SymbolKind.Interface;
            } else {
                return;
            }
            const location: Location = {
                range: {
                    start: { line: element.line, character: 0 },
                    end: { line: element.lineEnd, character: 100 }  
                },
                uri: uri
            };
            const newSymbol: SymbolInformation = {
                kind: kind,
                location: location,
                name: elemName
            }

            symbols.push(newSymbol);
        }); 
    });

    return symbols;
}

export function getWorkspaceSymbols (params: WorkspaceSymbolParams, defaultMods:  Map<string, string>): Promise<SymbolInformation[]> {
    
    return new Promise((resolve, reject) => {
        let symbols: SymbolInformation[] = [];

        const lcQuery = params.query.toLowerCase();
        defaultMods.forEach((modUri: string, modName: string) => {
            if(true){ // Just send the whole list and let the client sort through it with fuzzy search
            // if(!lcQuery || modName.toLowerCase().startsWith(lcQuery)){ 

                const location: Location = {
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 100 }  
                    },
                    uri: modUri
                };

                symbols.push({
                    name: modName,
                    kind: SymbolKind.Module,
                    location: location
                });
            }
        });
        resolve(symbols);
    });
}