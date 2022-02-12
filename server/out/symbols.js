"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWorkspaceSymbols = exports.getSymbols = void 0;
const node_1 = require("vscode-languageserver/node");
function waitForDoc(navSymbols, uri) {
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
            }
            ;
        }, 100);
    });
}
function getSymbols(navSymbols, uri) {
    return waitForDoc(navSymbols, uri).then((perlDoc) => {
        var _a;
        let symbols = [];
        (_a = perlDoc.elems) === null || _a === void 0 ? void 0 : _a.forEach((elements, elemName) => {
            const element = elements[0]; // All Elements are with same name are normally the same.
            if (["s", "p"].includes(element.type)) {
                const location = {
                    range: {
                        start: { line: element.line, character: 0 },
                        end: { line: element.line, character: 100 }
                    },
                    uri: uri
                };
                const newSymbol = {
                    kind: element.type == "p" ? node_1.SymbolKind.Package : node_1.SymbolKind.Function,
                    location: location,
                    name: elemName
                };
                symbols.push(newSymbol);
            }
        });
        return symbols;
    }).catch((reason) => {
        console.log(reason);
        return [];
    });
}
exports.getSymbols = getSymbols;
function getWorkspaceSymbols(params, defaultMods) {
    return new Promise((resolve, reject) => {
        let symbols = [];
        const lcQuery = params.query.toLowerCase();
        defaultMods.forEach((modUri, modName) => {
            if (true) { // Just send the whole list and let the client sort through it with fuzzy search
                // if(!lcQuery || modName.toLowerCase().startsWith(lcQuery)){ 
                const location = {
                    range: {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: 100 }
                    },
                    uri: modUri
                };
                symbols.push({
                    name: modName,
                    kind: node_1.SymbolKind.Module,
                    location: location
                });
            }
        });
        resolve(symbols);
    });
}
exports.getWorkspaceSymbols = getWorkspaceSymbols;
//# sourceMappingURL=symbols.js.map