import {
    SymbolInformation,
    SymbolKind,
    Location,
} from 'vscode-languageserver/node';
import { PerlDocument, PerlElem, PerlSymbolKind } from "./web-types";

function waitForDoc (navSymbols: any, uri: string): Promise<PerlDocument> {
    let retries = 0;
    
    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {

            if (++retries > 100) { // Wait for 10 seconds looking for the document. 
                reject("Found no document");
                clearInterval(interval);
            }
            const perlDoc = navSymbols.get(uri);

            if (perlDoc) {
                resolve(perlDoc);
                clearInterval(interval);
            };
        }, 100);
    });
}

export function getSymbols (navSymbols: any, uri: string ): Promise<SymbolInformation[]> {
    
    return waitForDoc(navSymbols, uri).then((perlDoc) => {
        let symbols: SymbolInformation[] = [];
        perlDoc.elems?.forEach((elements: PerlElem[], elemName: string) => {
            
            elements.forEach(element => {
                let kind: SymbolKind;
                if (element.type == PerlSymbolKind.LocalSub){
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
    }).catch((reason)=>{
        // TODO: Add logging back, but detect STDIO mode first
        console.log("Failed in getSymbols");
        console.log(reason);
        return [];
    });
}
