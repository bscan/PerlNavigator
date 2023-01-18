import {
    TextDocumentPositionParams,
    Hover,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem } from "./web-types";
import { getSymbol, lookupSymbol } from "./web-utils";

export function getHover(params: TextDocumentPositionParams, perlDoc: PerlDocument, txtDoc: TextDocument): Hover | undefined {

    let position = params.position
    const symbol = getSymbol(position, txtDoc);

    let elem = perlDoc.canonicalElems.get(symbol);

    if(!elem){
        const elems = lookupSymbol(perlDoc, symbol, position.line);
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
    if ( ["v", "c"].includes(elem.type) && ( elem.typeDetail.length > 1 || /^\$self/.test(symbol))) {
        // We either know the object type, or it's $self
        desc = "(object) ";
        if (/^\$self/.test(symbol)) {
            desc += `${elem.package}`; 
        } else {
            desc += `${elem.typeDetail}`;
        } 
    } else if(elem.type == 'v'){
        // desc = `(variable) ${symbol}`; //  Not very interesting info
    } else if (elem.type == 'n'){ 
        desc = `(constant) ${symbol}`;
    } else if(elem.type == 'c'){ 
        desc = `${elem.name}: ${elem.value}`;
        if(elem.package) desc += ` (${elem.package})` ; // Is this ever known?
    } else if(elem.type == 'h'){ 
        desc = `${elem.name}  (${elem.package})`;
    } else if (elem.type == 's'){
        desc = `(subroutine) ${symbol}`;
    } else if (['o','x'].includes(elem.type)){
        desc = `(method) ${symbol}`;
    } else if  (['t','i'].includes(elem.type)){ // inherited methods can still be subs (e.g. new from a parent)
        desc = `(subroutine) ${elem.name}`;
        if(elem.typeDetail && elem.typeDetail != elem.name) desc = desc + ` (${elem.typeDetail})`;
    }else if (elem.type == 'p'){
        desc = `(package) ${elem.name}`;
    } else if (elem.type == 'm'){
        desc = `(module) ${elem.name}: ${elem.file}`;
    } else if (elem.type == 'l'){ 
        desc = `(label) ${symbol}`;
    } else if (elem.type == 'a'){
        desc = `(class) ${symbol}`;
    } else if (elem.type == 'b'){
        desc = `(role) ${symbol}`;
    } else if (elem.type == 'f' || elem.type == 'd'){
        desc = `(attribute) ${symbol}`;
    } else if (elem.type == 'e'){ 
        desc = `(phase) ${symbol}`;
    } else {
        // We should never get here
        desc = `Unknown: ${symbol}`;
    }


    return desc;
}
