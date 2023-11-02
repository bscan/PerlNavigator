import { TextDocumentPositionParams, Hover, MarkupContent, MarkupKind } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { PerlDocument, PerlElem, PerlSymbolKind } from "./types";
import { getSymbol, lookupSymbol } from "./utils";
import { refineElementIfSub } from "./refinement";
import { getPod } from './pod';

import Uri from "vscode-uri";

export async function getHover(params: TextDocumentPositionParams, perlDoc: PerlDocument, txtDoc: TextDocument, modMap: Map<string, string>): Promise<Hover | undefined> {
    let position = params.position;
    const symbol = getSymbol(position, txtDoc);

    let elem = perlDoc.canonicalElems.get(symbol);

    if (!elem) {
        const elems = lookupSymbol(perlDoc, modMap, symbol, position.line);
        // Nothing or too many things.
        if (elems.length != 1) return;
        elem = elems[0];
    }

    const refined = await refineElementIfSub(elem, params, perlDoc);

    let title = buildHoverDoc(symbol, elem, refined);

    // Sometimes, there's nothing worth showing.
    // I'm assuming we won't get any useful POD if we can't get a useful title. Could be wrong
    if (!title) return;

    let merged = title;
    
    let docs = await getPod(elem, perlDoc, modMap);

    if(docs){
        if(!docs.startsWith("\n"))
            docs = "\n" + docs; // Markdown requires two newlines to make one
        merged += `\n${docs}`;
    }

    const hoverContent: MarkupContent = {
        kind: MarkupKind.Markdown,
        value: merged
    };

    const documentation: Hover = { contents: hoverContent };

    return documentation;
}

function buildHoverDoc(symbol: string, elem: PerlElem, refined: PerlElem | undefined) {
    let sig = "";
    let name = elem.name;
    // Early return.
    if ([PerlSymbolKind.LocalVar, PerlSymbolKind.ImportedVar, PerlSymbolKind.Canonical].includes(elem.type)) {
        if (elem.typeDetail.length > 0) return `(object) ${elem.typeDetail}`;
        else if (symbol.startsWith("$self"))
            // We either know the object type, or it's $self
            return `(object) ${elem.package}`;
    }
    if (refined && refined.signature) {
        let signature = refined.signature;
        signature = [...signature];
        if (symbol.indexOf("->") != -1 && refined.type != PerlSymbolKind.LocalMethod) {
            signature.shift();
            name = name.replace(/::(\w+)$/, "->$1");
        }
        if (signature.length > 0) sig = "(" + signature.join(", ") + ")";
    }
    let desc;
    switch (elem.type) {
        case PerlSymbolKind.ImportedSub: // inherited methods can still be subs (e.g. new from a parent)
        case PerlSymbolKind.Inherited:
            desc = `(subroutine) ${name}${sig}`;
            if (elem.typeDetail && elem.typeDetail != elem.name) desc += `  [${elem.typeDetail}]`;
            break;
        case PerlSymbolKind.LocalSub:
            desc = `(subroutine) ${name}${sig}`;
            break;
        case PerlSymbolKind.LocalMethod:
        case PerlSymbolKind.Method:
            desc = `(method) ${name}${sig}`;
            break;
        case PerlSymbolKind.LocalVar:
            // Not very interesting info
            // desc = `(variable) ${symbol}`;
            break;
        case PerlSymbolKind.Constant:
            desc = `(constant) ${symbol}`;
            break;
        case PerlSymbolKind.ImportedVar:
            desc = `${name}: ${elem.value}`;
            if (elem.package) desc += ` [${elem.package}]`; // Is this ever known?
            break;
        case PerlSymbolKind.ImportedHash:
            desc = `${elem.name}  [${elem.package}]`;
            break;
        case PerlSymbolKind.Package:
            desc = `(package) ${elem.name}`;
            break;
        case PerlSymbolKind.Module: {
            let file = Uri.parse(elem.uri).fsPath;
            desc = `(module) ${elem.name}: ${file}`;
            break;
        }
        case PerlSymbolKind.Label:
            desc = `(label) ${symbol}`;
            break;
        case PerlSymbolKind.Class:
            desc = `(class) ${symbol}`;
            break;
        case PerlSymbolKind.Role:
            desc = `(role) ${symbol}`;
            break;
        case PerlSymbolKind.Field:
        case PerlSymbolKind.PathedField:
            desc = `(attribute) ${elem.name}`;
            break;
        case PerlSymbolKind.Phaser:
            desc = `(phase) ${symbol}`;
            break;
        case PerlSymbolKind.HttpRoute:
        case PerlSymbolKind.OutlineOnlySub:
            // You cant go-to or hover on a route or outline only sub.
            break;
        case PerlSymbolKind.AutoLoadVar:
            desc = `(autoloaded) ${symbol}`;
            break;
        default:
            // We should never get here
            desc = `Unknown: ${elem.name}`;
            break;
    }
    return desc;
}
