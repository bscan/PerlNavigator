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
import { refineElement } from "./refinement";

export async function getSignature(params: TextDocumentPositionParams, perlDoc: PerlDocument, txtDoc: TextDocument, modMap: Map<string, string>): Promise<SignatureHelp | undefined> {
    let position = params.position
    const [symbol, currentSig] = getFunction(position, txtDoc);
    if (!symbol)
        return;
    const elems = lookupSymbol(perlDoc, modMap, symbol, position.line);
    // Nothing or too many things.
    if (elems.length != 1)
        return;
    let elem = elems[0];
    const refined = await refineElement(elem, params);
    if (!refined)
        return;
    // const elem_count = perlDoc.elems.size; // Currently unused.
    return buildSignature(refined, currentSig, symbol);
}


function getFunction(position: Position, txtDoc: TextDocument): string[] {
    const start = { line: position.line, character: 0 };
    const end = { line: position.line + 1, character: 0 };
    const text = txtDoc.getText({ start, end });
    const index = txtDoc.offsetAt(position) - txtDoc.offsetAt(start);
    // Find signature.
    const r = text.lastIndexOf('(', index); //right
    if (r == -1)
	    return [];
    let l = r - 1; // left
    const canShift = (c: string) => /[\w\:\>\-]/.exec(c);
    for (; l >= 0 && canShift(text[l]); --l)
        // Allow for ->, but not => or > (e.g. $foo->bar, but not $foo=>bar or $foo>bar).
        if (text[l] == ">")
	    if (l - 1 >= 0
		&& text[l - 1] != '-')
	        break;
    let symbol = text.substring(Math.max(l + 1, 0), r);
    if (l >= 0) {
	const lCh = text[l];
        // Allow variables as well because we know may know the object type.
	if (lCh == '$' || lCh == '@' || lCh == '%') {
	    symbol = lCh + symbol;
	    // --l; // Currently unused?
	}
    }
    const currentSig = text.substring(r, index);
    return [symbol, currentSig];
}

function buildSignature(elem: PerlElem, currentSig:string, symbol:string): SignatureHelp | undefined {
    let params = elem.signature;
    if (!params)
        return;
    params  = [...params]; // Clone to ensure we don't modify the original
    let activeParameter = (currentSig.match(/,/g) || []).length;
    if (symbol.match(/->/)) {
        // Subroutine vs method is not relevant, only matters if you called it as a method. 
        params.shift();
        // function_name = function_name.replace(/::(\w+)$/, '->$1');
    }
    if (params.length == 0)
        return;
    let paramLabels: ParameterInformation[] = [];
    for (const param of params)
        paramLabels.push({label: param});
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
