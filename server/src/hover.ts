import {
    TextDocumentPositionParams,
    Hover,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem, PerlSymbolKind } from "./types";
import { getSymbol, lookupSymbol } from "./utils";

export function getHover(params: TextDocumentPositionParams, perlDoc: PerlDocument, txtDoc: TextDocument, modMap: Map<string, string>): Hover | undefined {

    let position = params.position
    const symbol = getSymbol(position, txtDoc);

    let elem = perlDoc.canonicalElems.get(symbol);

    if(!elem){
        const elems = lookupSymbol(perlDoc, modMap, symbol, position.line);
        if(elems.length != 1) return; // Nothing or too many things.
        elem = elems[0];
    }

    let hoverStr = buildHoverDoc(symbol, elem);
    if(!hoverStr) return; // Sometimes, there's nothing worth showing.

    const documentation = {contents: hoverStr};

    return documentation;
}

function buildHoverDoc(symbol: string, elem: PerlElem){

    let desc = "";
    if ([PerlSymbolKind.LocalVar,
	PerlSymbolKind.ImportedVar,
        PerlSymbolKind.Canonical].includes(elem.type)) {
	if (elem.typeDetail.length > 0)
            desc = "(object) " + `${elem.typeDetail}`;
	else if (/^\$self/.test(symbol))
            // We either know the object type, or it's $self
            desc = "(object) " + `${elem.package}`; 
    }
    switch (elem.type) {
    case PerlSymbolKind.ImportedSub: // inherited methods can still be subs (e.g. new from a parent)
    case PerlSymbolKind.Inherited:
        desc = `(subroutine) ${elem.name}`;
        if (elem.typeDetail && elem.typeDetail != elem.name)
    	    desc = desc + ` (${elem.typeDetail})`;
        break;
    case PerlSymbolKind.LocalMethod:
    case PerlSymbolKind.Method:
        desc = `(method) ${symbol}`;
        break;
    // case 'v':
        // Not very interesting info
        // desc = `(variable) ${symbol}`;
        // break;
    case PerlSymbolKind.Constant: 
        desc = `(constant) ${symbol}`;
        break;
    case PerlSymbolKind.ImportedVar: 
        desc = `${elem.name}: ${elem.value}`;
        if (elem.package)
    	    desc += ` (${elem.package})` ; // Is this ever known?
        break;
    case PerlSymbolKind.ImportedHash: 
        desc = `${elem.name}  (${elem.package})`;
        break;
    case PerlSymbolKind.LocalSub:
        desc = `(subroutine) ${symbol}`;
        break;
    case PerlSymbolKind.Package:
        desc = `(package) ${elem.name}`;
        break;
    case PerlSymbolKind.Module:
        desc = `(module) ${elem.name}: ${elem.file}`;
        break;
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
        desc = `(attribute) ${symbol}`;
        break;
    case PerlSymbolKind.Phaser: 
        desc = `(phase) ${symbol}`;
        break;
    case PerlSymbolKind.HttpRoute:
    case PerlSymbolKind.OutlineOnlySub: 
        // You cant go-to or hover on a route or outline only sub.
        break;
    default:
        // We should never get here
        desc = `Unknown: ${symbol}`;
        break;
    }
    return desc;
}
