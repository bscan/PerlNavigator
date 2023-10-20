import { SymbolInformation, Range, SymbolKind, Location, WorkspaceSymbolParams } from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";

import { ParseType, PerlElem, PerlSymbolKind } from "./types";
import { parseDocument } from "./parser";

export async function getSymbols(textDocument: TextDocument, uri: string): Promise<SymbolInformation[]> {
    let perlDoc = await parseDocument(textDocument, ParseType.outline);

    let symbols: SymbolInformation[] = [];
    perlDoc.elems?.forEach((elements: PerlElem[], elemName: string) => {
        elements.forEach((element) => {
            let kind: SymbolKind;
            switch (element.type) {
                case PerlSymbolKind.LocalSub:
                case PerlSymbolKind.OutlineOnlySub:
                    kind = SymbolKind.Function;
                    break;
                case PerlSymbolKind.LocalMethod:
                    kind = SymbolKind.Method;
                    break;
                case PerlSymbolKind.Package:
                    kind = SymbolKind.Package;
                    break;
                case PerlSymbolKind.Class:
                    kind = SymbolKind.Class;
                    break;
                case PerlSymbolKind.Role:
                    kind = SymbolKind.Interface;
                    break;
                case PerlSymbolKind.Field:
                    kind = SymbolKind.Field;
                    break;
                case PerlSymbolKind.Label:
                    kind = SymbolKind.Key;
                    break;
                case PerlSymbolKind.Phaser:
                    kind = SymbolKind.Event;
                    break;
                case PerlSymbolKind.Constant:
                    kind = SymbolKind.Constant;
                    break;
                case PerlSymbolKind.HttpRoute:
                    kind = SymbolKind.Interface;
                    break;
                default:
                    return;
            }
            const location: Location = {
                range: {
                    start: { line: element.line, character: 0 },
                    end: { line: element.lineEnd, character: 100 },
                },
                uri: uri,
            };
            const newSymbol: SymbolInformation = {
                kind: kind,
                location: location,
                name: elemName,
            };

            symbols.push(newSymbol);
        });
    });

    return symbols;
}

export function getWorkspaceSymbols(params: WorkspaceSymbolParams, defaultMods: Map<string, string>): Promise<SymbolInformation[]> {
    return new Promise((resolve, reject) => {
        let symbols: SymbolInformation[] = [];

        // const lcQuery = params.query.toLowerCase(); // Currently unused.
        defaultMods.forEach((modUri: string, modName: string) => {
            if (true) {
                // Just send the whole list and let the client sort through it with fuzzy search
                // if(!lcQuery || modName.toLowerCase().startsWith(lcQuery)){

                const location: Location = {
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 100 },
                    },
                    uri: modUri,
                };

                symbols.push({
                    name: modName,
                    kind: SymbolKind.Module,
                    location: location,
                });
            }
        });
        resolve(symbols);
    });
}
