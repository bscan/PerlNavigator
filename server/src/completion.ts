import {
    TextDocumentPositionParams,
    CompletionItem,
    CompletionItemKind,
    Range
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem, CompletionPrefix } from "./types";


export function getCompletions(params: TextDocumentPositionParams, perlDoc: PerlDocument, txtDoc: TextDocument): CompletionItem[] {

    let position = params.position
    const start = { line: position.line, character: 0 };
    const end = { line: position.line + 1, character: 0 };
    const text = txtDoc.getText({ start, end });

    const index = txtDoc.offsetAt(position) - txtDoc.offsetAt(start);
    console.log(`Index is ${index} and start is ${position.character}`);

    const prefix = getPrefix(text, index);

    if(!prefix.symbol) return [];
    console.log("Looking at prefix: " + prefix.symbol);

    const replace: Range = {
            start: { line: position.line, character: prefix.charStart },
            end: { line: position.line, character: prefix.charEnd }  
    };

    const matches = getMatches(perlDoc, prefix.symbol, replace);

    return matches;

}


// Similar to getSymbol for navigation, but don't "move right". 
function getPrefix(text: string, position: number): CompletionPrefix {

    const leftAllow  = (c: string) => /[\w\:\>\-]/.exec(c);

    let left = position - 1;
    let right = position;

    while (left >= 0 && leftAllow(text[left])) {
        left -= 1;
    }
    left = Math.max(0, left + 1);

    let symbol = text.substring(left, right);
    const lChar  = left > 0 ? text[left-1] : "";

    if(lChar === '$' || lChar === '@' || lChar === '%'){
        symbol = lChar + symbol;
        left -= 1;
    }

    return {symbol: symbol, charStart: left, charEnd: right};
}


function getMatches(perlDoc: PerlDocument, symbol: string,  replace: Range): CompletionItem[] {

    let matches: CompletionItem[] = [];

    let qualifiedSymbol = symbol.replace(/->/g, "::"); // Module->method() can be found via Module::method
    qualifiedSymbol = qualifiedSymbol.replace(/-$/g, ":"); // Maybe I just started typing Module-

    // Check if we know the type of this object
    let knownObject = /^(\$\w+):(?::\w*)?$/.exec(qualifiedSymbol);
    if(knownObject){
        const targetVar = perlDoc.elems.get(knownObject[1]);
        if(targetVar && targetVar.type.length > 1){
            qualifiedSymbol = qualifiedSymbol.replace(/^\$\w+(?=:)/, targetVar.type);
        }
    }

    perlDoc.elems.forEach((element: PerlElem, elemName: string) => {
        if(/\s/.test(elemName)) return; // Remove my "use" statements. TODO: put these somewhere other than doc.elems
        if(/^[\$\@\%].$/.test(elemName)) return; // Remove single character magic perl variables. Mostly clutter the list

        if (elemName.startsWith(qualifiedSymbol) && matchAllowed(perlDoc, elemName)){
            // Most stuff goes through this path. Variables, subs, constants, modules, whatever.

            // You may have asked for FOO::BAR->BAZ or $qux->BAZ and I found FOO::BAR::BAZ. Let's put back the arrow or variable before sending
            let aligned = elemName.replace(new RegExp(`^${qualifiedSymbol}`, 'gi'), symbol);

            if(symbol.endsWith('-')) aligned = aligned.replace(new RegExp(`-:`, 'gi'), '->');  // Half-arrows count too

            // Don't send invalid constructs like FOO->BAR::BAZ, n or FOO->BAR if Bar is not a sub/method.
            if(/\-\>\w+::/.test(aligned) || (/\-\>\w+$/.test(aligned) && !["s","t"].includes(element.type))) return;

            matches.push(buildMatch(aligned, element, replace));
        }
    });

    return matches;

}

// TODO: preprocess all "allowed" matches so we don't waste time iterating over them for every autocomplete.
function matchAllowed(perlDoc: PerlDocument, elemName: string){
    let modRg = /^(.+)::.*?$/;
    var match = modRg.exec(elemName);
    if(match){
        if(!perlDoc.elems.has(`use ${match[1]}`)){
            // Thing looks like a module, but was not explicitly imported
            return 0;
        }
    }
    // Thing was either explictly imported or not a module function
    return 1;
}

function buildMatch(elemName: string, elem: PerlElem, range: Range): CompletionItem {

    let kind: CompletionItemKind;
    if(elem.type == 'v'){ 
        kind = CompletionItemKind.Variable;
    } else if (elem.type == 's'){
        kind = CompletionItemKind.Function;
    } else if (elem.type == 't'){
        kind = CompletionItemKind.Method;
    }else if (elem.type == 'p' || elem.type == 'm'){
        kind = CompletionItemKind.Module;
    }else if (elem.type == 'l'){ // Loop labels
        kind = CompletionItemKind.Reference;
    }else if (elem.type.length > 1){ // Still just a variable, but we know the type
        kind = CompletionItemKind.Class;
    } else{
        kind = CompletionItemKind.Property;
    }
    return {
        label: elemName,
        textEdit: {newText: elemName, range},
        kind: kind
    }
}