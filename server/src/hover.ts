import {
    TextDocumentPositionParams,
    Hover,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem } from "./types";
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
    if (["v", "c", "1"].includes(elem.type)) {
	if (elem.typeDetail.length > 0)
            desc = "(object) " + `${elem.typeDetail}`;
	else if (/^\$self/.test(symbol))
            // We either know the object type, or it's $self
            desc = "(object) " + `${elem.package}`; 
    } else {
        switch (elem.type) {
        case 't': // inherited methods can still be subs (e.g. new from a parent)
        case 'i':
            desc = `(subroutine) ${elem.name}`;
            if (elem.typeDetail && elem.typeDetail != elem.name)
                desc = desc + ` (${elem.typeDetail})`;
	    break;
        case 'o':
        case 'x':
            desc = `(method) ${symbol}`;
	    break;
        case 'v':
            // Not very interesting info
            // desc = `(variable) ${symbol}`;
	    break;
        case 'n': 
            desc = `(constant) ${symbol}`;
	    break;
        case 'c': 
            desc = `${elem.name}: ${elem.value}`;
            if (elem.package)
                desc += ` (${elem.package})` ; // Is this ever known?
	    break;
        case 'h': 
            desc = `${elem.name}  (${elem.package})`;
	    break;
        case 's':
            desc = `(subroutine) ${symbol}`;
	    break;
        case 'p':
            desc = `(package) ${elem.name}`;
	    break;
        case 'm':
            desc = `(module) ${elem.name}: ${elem.file}`;
	    break;
        case 'l': 
            desc = `(label) ${symbol}`;
	    break;
        case 'a':
            desc = `(class) ${symbol}`;
	    break;
        case 'b':
            desc = `(role) ${symbol}`;
	    break;
        case 'f':
        case 'd':
            desc = `(attribute) ${symbol}`;
	    break;
        case 'e': 
            desc = `(phase) ${symbol}`;
	    break;
        case 'g':
        case 'j': 
            // You cant go-to or hover on a route or outline only sub.
	    break;
        default:
            // We should never get here
            desc = `Unknown: ${symbol}`;
	    break;
        }
    }
    return desc;
}
