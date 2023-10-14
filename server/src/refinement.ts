import {
    TextDocumentPositionParams,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation
} from 'vscode-languageserver/node';
import { TextDocument, Position } from 'vscode-languageserver-textdocument';
import { ElemSource, ParseType, PerlDocument, PerlElem, PerlSymbolKind } from "./types";
import {  lookupSymbol } from "./utils";
import { parseFromUri } from "./parser";


var LRU = require("lru-cache");

// Extremely short 30 second cache of parsed documents. Similar to the one in server.ts, but this is refinement-centric (signatures, navigation).
// Usually only used for typing multiple signatures, hover over the same place, etc.
// Parsing is so fast, I'm not sure this is even needed.
const parsedDocs = new LRU({max: 10, ttl: 1000 * 30 });


export async function refineElement(elem: PerlElem, params: TextDocumentPositionParams | undefined): Promise<PerlElem | undefined> {
    if (![PerlSymbolKind.LocalSub,
        PerlSymbolKind.ImportedSub,
        PerlSymbolKind.Inherited,
        PerlSymbolKind.LocalMethod,
        PerlSymbolKind.Method].includes(elem.type)) {
        return;
    }
    let refined: PerlElem | undefined = undefined;
    if (elem.source == ElemSource.parser) {
        // We're typing the actual signature or hovering over the definition. No pop-up needed.
        if (params && elem.line == params.position.line)
            return;
        // Should I instead always only parse on demand? Could speed up processing a bit on the diagnostics tagging side?
        refined = elem;
    } else {
        let doc = parsedDocs.get(elem.uri);
        if(!doc){
            doc = await parseFromUri(elem.uri, ParseType.signatures);
            if(!doc)
                return;
            parsedDocs.set(elem.uri, doc);
        }

        // Looks up Foo::Bar::baz by only the function name baz
        // Will fail if you have multiple same name functions in the same file.
        let match = elem.name.match(/\w+$/);
        if (match) {
            const refinedElems = doc.elems.get(match[0]);
            if (refinedElems && refinedElems.length == 1)
                refined = refinedElems[0];
        }
    }
    return refined;
}

