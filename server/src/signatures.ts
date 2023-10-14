import {
    TextDocumentPositionParams,
    SignatureHelp,
    SignatureInformation,
    ParameterInformation
} from 'vscode-languageserver/node';
import { TextDocument, Position } from 'vscode-languageserver-textdocument';
import { ParseType, PerlDocument, PerlElem, PerlSymbolKind } from "./types";
import {  lookupSymbol } from "./utils";
import { parseFromUri } from "./parser";

export async function getSignature(params: TextDocumentPositionParams, perlDoc: PerlDocument, txtDoc: TextDocument, modMap: Map<string, string>): Promise<SignatureHelp | undefined> {
    let position = params.position
    const [symbol, currentSig] = getFunction(position, txtDoc);
    if(!symbol){
        return;
    }
    const elems = lookupSymbol(perlDoc, modMap, symbol, position.line);

    if(elems.length != 1) return; // Nothing or too many things.
    let elem = elems[0];

    const refined = await refineForSignature(elem, perlDoc, params);
    if(!refined){
        return;
    }
    const elem_count = perlDoc.elems.size

    return buildSignature(refined, currentSig, symbol);
}

export async function refineForSignature(elem: PerlElem, perlDoc: PerlDocument, params: TextDocumentPositionParams): Promise<PerlElem | undefined> {

    if (![PerlSymbolKind.LocalSub, PerlSymbolKind.ImportedSub, PerlSymbolKind.Inherited, PerlSymbolKind.LocalMethod, PerlSymbolKind.Method].includes(elem.type)) {
        return;
    }

    let refined: PerlElem | undefined = undefined;
    if(perlDoc.uri == elem.uri){
        if(elem.line == params.position.line){
            // We're typing the actual signature or hovering over the definition. No pop-up needed
            return;
        }
        // Should I instead always only parse on demand? Could speed up processing a bit on the diagnostics tagging side
        refined = elem;
    } else {
        const doc = await parseFromUri(elem.uri, ParseType.signatures);
        if(!doc) return 
        // Looks up Foo::Bar::baz by only the function name baz
        // Will fail if you have multiple same name functions in the same file.
        let match;
        if(match = elem.name.match(/\w+$/)){
            const refinedElems = doc.elems.get(match[0]);
            if(refinedElems && refinedElems.length == 1){
                refined = refinedElems[0];
            }
        }
    }

    return refined;
}


function getFunction(position: Position, txtDoc: TextDocument): string[] {
    const start = { line: position.line, character: 0 };
    const end = { line: position.line + 1, character: 0 };
    const text = txtDoc.getText({ start, end });
    const index = txtDoc.offsetAt(position) - txtDoc.offsetAt(start);
    let left = index - 1;
    let right = index;

    const leftAllow  = (c: string) => /[\w\:\>\-]/.exec(c);

    // First move all left until you find the signature
    while (left >= 0 && text[right] != '(') {
        left--;
        right--;
    }
    if(left == 0){
        return [];
    }

    while (left >= 0 && leftAllow(text[left])) {
        // Allow for ->, but not => or > (e.g. $foo->bar, but not $foo=>bar or $foo>bar) 
        if (text[left] === ">" && left - 1 >= 0 && text[left - 1] !== "-") { break; }
        left -= 1;
    }
    
    left = Math.max(0, left + 1);

    let symbol = text.substring(left, right);
    const lChar  = left > 0 ? text[left-1] : "";

    if(lChar === '$' || lChar === '@' || lChar === '%'){
        // Allow variables as well because we know may know the object type
        symbol = lChar + symbol;
        left -= 1;
    }

    const currentSig = text.substring(right, index);

    return [symbol, currentSig];
}

function buildSignature(elem: PerlElem, currentSig:string, symbol:string): SignatureHelp | undefined {

    let params = elem.signature;
    if(!params){ return; }

    params  = [...params]; // Clone to ensure we don't modify the original

    let activeParameter = (currentSig.match(/,/g) || []).length;
    if(symbol.match(/->/)){
        // Subroutine vs method is not relevant, only matters if you called it as a method. 
        params.shift();
        // function_name = function_name.replace(/::(\w+)$/, '->$1');
    }

    if(params.length == 0){ return; }

    let paramLabels: ParameterInformation[] = [];
    for(const param of params){
        paramLabels.push({label: param});
    } 

    let mainSig: SignatureInformation = {
        parameters: paramLabels,
        label: '(' + params.join(', ') + ')',
    }
    let sig: SignatureHelp = {
        signatures: [mainSig],
        activeSignature: 0,
        activeParameter: activeParameter
    }

    return sig;
}
