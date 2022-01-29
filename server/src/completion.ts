import {
    TextDocumentPositionParams,
    CompletionItem,
    CompletionItemKind,
    Range
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem, CompletionPrefix } from "./types";


export function getCompletions(params: TextDocumentPositionParams, perlDoc: PerlDocument, txtDoc: TextDocument, mods: string[]): CompletionItem[] {

    let position = params.position
    const start = { line: position.line, character: 0 };
    const end = { line: position.line + 1, character: 0 };
    const text = txtDoc.getText({ start, end });

    const index = txtDoc.offsetAt(position) - txtDoc.offsetAt(start);

    const imPrefix = getImportPrefix(text, index);
    if (imPrefix) {
        const replace: Range = {
            start: { line: position.line, character: imPrefix.charStart },
            end: { line: position.line, character: imPrefix.charEnd }  
        };

        const matches = getImportMatches(mods, imPrefix.symbol, replace);
        return matches;

    } else {
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

}


// Similar to getSymbol for navigation, but don't "move right". 
function getPrefix(text: string, position: number): CompletionPrefix {

    const leftAllow  = (c: string) => /[\w\:\>\-]/.exec(c);

    let left = position - 1;

    while (left >= 0 && leftAllow(text[left])) {
        left -= 1;
    }
    left = Math.max(0, left + 1);

    let symbol = text.substring(left, position);
    const lChar  = left > 0 ? text[left-1] : "";

    if(lChar === '$' || lChar === '@' || lChar === '%'){
        symbol = lChar + symbol;
        left -= 1;
    }

    return {symbol: symbol, charStart: left, charEnd: position};
}

// First we check if it's an import statement, which is a special type of autocomplete with far more options
function getImportPrefix(text: string, position: number): CompletionPrefix | undefined {

    text = text.substring(0, position);
    console.log(`import check of ${text}`);

    let partialImport = /^\s*(?:use|require)\s+([\w:]+)$/.exec(text);
    if(!partialImport) return;
    const symbol = partialImport[1];

    return {symbol: symbol, charStart: position - symbol.length, charEnd: position};
}

function getImportMatches(mods: string[], symbol: string,  replace: Range): CompletionItem[] {
    const matches: CompletionItem[] = []

    const lcSymbol = symbol.toLowerCase();
    mods.forEach(mod => {
        if(mod.toLowerCase().startsWith(lcSymbol)){
            matches.push({
                label: mod,
                textEdit: {newText: mod, range: replace},
                kind: CompletionItemKind.Module,
            });
        }
    });
    return matches;
}

function getMatches(perlDoc: PerlDocument, symbol: string,  replace: Range): CompletionItem[] {

    let matches: CompletionItem[] = [];

    let qualifiedSymbol = symbol.replace(/->/g, "::"); // Module->method() can be found via Module::method
    qualifiedSymbol = qualifiedSymbol.replace(/-$/g, ":"); // Maybe I just started typing Module-

    // Check if we know the type of this object
    let knownObject = /^(\$\w+):(?::\w*)?$/.exec(qualifiedSymbol);
    if(knownObject){
        const targetVar = perlDoc.vartypes.get(knownObject[1]);
        if(targetVar) qualifiedSymbol = qualifiedSymbol.replace(/^\$\w+(?=:)/, targetVar.type);
    }

    // If the magic variable $self->, then autocomplete to everything in main. 
    const bSelf = /^(\$self):(?::\w*)?$/.exec(qualifiedSymbol);
    const lcQualifiedSymbol = qualifiedSymbol.toLowerCase();

    perlDoc.elems.forEach((element: PerlElem, elemName: string) => {
        if(/\s/.test(elemName)) return; // Remove my "use" statements. TODO: put these somewhere other than doc.elems
        if(/^[\$\@\%].$/.test(elemName)) return; // Remove single character magic perl variables. Mostly clutter the list

        // All plain and inherited subroutines should match with $self. We're excluding methods here because imports clutter the list.
        if(bSelf && ["s", "i"].includes(element.type) ) elemName = `$self::${elemName}`;

        if (goodMatch(perlDoc, elemName, lcQualifiedSymbol)){
            // Hooray, it's a match! 

            // You may have asked for FOO::BAR->BAZ or $qux->BAZ and I found FOO::BAR::BAZ. Let's put back the arrow or variable before sending
            const quotedSymbol = qualifiedSymbol.replace(/([\$])/g, '\\$1'); // quotemeta for $self->FOO
            let aligned = elemName.replace(new RegExp(`^${quotedSymbol}`, 'gi'), symbol);

            if(symbol.endsWith('-')) aligned = aligned.replace(new RegExp(`-:`, 'gi'), '->');  // Half-arrows count too

            // Don't send invalid constructs
            if(/\-\>\w+::/.test(aligned) ||  // like FOO->BAR::BAZ
                (/\-\>\w+$/.test(aligned) && !["s","t", "i"].includes(element.type)) || // FOO->BAR if Bar is not a sub/method.
                (/^\$.*::/.test(aligned)) // $Foo::Bar, I don't really hunt for these anyway             
                ) return;

            matches.push(buildMatch(aligned, element, replace));
        }
    });

    return matches;

}

// TODO: preprocess all "allowed" matches so we don't waste time iterating over them for every autocomplete.
function goodMatch(perlDoc: PerlDocument, elemName: string, lcQualifiedSymbol: string): boolean {

    if(!elemName.toLowerCase().startsWith(lcQualifiedSymbol)) return false;

    // Get the module name to see if it's been imported. Otherwise, don't allow it.
    let modRg = /^(.+)::.*?$/;
    var match = modRg.exec(elemName);
    if(match){
        if(!perlDoc.imported.has(match[1]) && match[1] != '$self'){
            // Thing looks like a module, but was not explicitly imported
            return false;
        }
    }
    // Thing was either explictly imported or not a module function
    return true;
}

function buildMatch(elemName: string, elem: PerlElem, range: Range): CompletionItem {

    let kind: CompletionItemKind;

    if (elem.type.length > 1 || ( elem.type == 'v' && elemName == '$self')) {
        // We either know the object type, or it's $self
        kind = CompletionItemKind.Class;
    } else if(elem.type == 'v'){ 
        kind = CompletionItemKind.Variable;
    } else if (elem.type == 's'){
        kind = CompletionItemKind.Function;
    } else if (elem.type == 't' || elem.type == 'i'){
        kind = CompletionItemKind.Method;
    }else if (elem.type == 'p' || elem.type == 'm'){
        kind = CompletionItemKind.Module;
    }else if (elem.type == 'l'){ // Loop labels
        kind = CompletionItemKind.Reference;
    } else{
        // A sign that something needs fixing. Everything should've been enumerated. 
        kind = CompletionItemKind.Property;
    }

    // Ensure sorting has public methods up front, followed by private and then capital. (private vs capital is arbitrary, but public makes sense).
    // Variables will still be higher when relevant. 
    let sortText: string;

    if(/^[A-Z][A-Z_]+$/.test(elemName) || /(?:::|->)[A-Z][A-Z_]+$/.test(elemName)){
        sortText = "4" + elemName;
    } else if(/^_$/.test(elemName) || /(?:::|->)_\w+$/.test(elemName)){
        sortText = "3" + elemName;
    } else if(/^\w$/.test(elemName) || /(?:::|->)\w+$/.test(elemName)){
        // Public methods / functions
        sortText = "2" + elemName;
    } else {
        // Variables and regex mistakes
        sortText = "1" + elemName;
    }


    return {
        label: elemName,
        textEdit: {newText: elemName, range},
        kind: kind,
        sortText: sortText,
    }
}