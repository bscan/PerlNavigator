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
    if(!symbol)
        return;
    const elems = lookupSymbol(perlDoc, modMap, symbol, position.line);
    // Nothing or too many things.
    if(elems.length != 1)
        return;
    let elem = elems[0];
    const refined = await refineForSignature(elem, perlDoc, params);
    if (!refined)
        return;
    // Currently unused.
    // const elem_count = perlDoc.elems.size;
    return buildSignature(refined, currentSig, symbol);
}

export async function refineForSignature(elem: PerlElem, perlDoc: PerlDocument, params: TextDocumentPositionParams): Promise<PerlElem | undefined> {
    if (![PerlSymbolKind.LocalSub,
	PerlSymbolKind.ImportedSub,
        PerlSymbolKind.Inherited,
	PerlSymbolKind.LocalMethod,
	PerlSymbolKind.Method].includes(elem.type)) {
        return;
    }
    let refined: PerlElem | undefined = undefined;
    if (perlDoc.uri == elem.uri) {
        // We're typing the actual signature or hovering over the definition. No pop-up needed.
        if (elem.line == params.position.line)
            return;
        // Should I instead always only parse on demand? Could speed up processing a bit on the diagnostics tagging side?
        refined = elem;
    } else {
        const doc = await parseFromUri(elem.uri, ParseType.signatures);
        if (!doc)
	    return ;
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


function getFunction(position: Position, txtDoc: TextDocument): string[] {
    const start = { line: position.line, character: 0 };
    const end = { line: position.line + 1, character: 0 };
    const text = txtDoc.getText({ start, end });
    const index = txtDoc.offsetAt(position) - txtDoc.offsetAt(start);
    // right
    let r = index;
    // Find signature.
    for (; r > 1 && text[r] != '('; --r)
    	;
    if (r <= 1)
        return [];
    // left
    let l = r - 1;
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
	    // Currently unused?
	    // --l;
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
    for(const param of params)
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
