import {
    TextDocumentPositionParams,
    CompletionItem,
    CompletionItemKind,
    Range,
    MarkupContent
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem, CompletionPrefix, PerlSymbolKind } from "./types";


export function getCompletions(params: TextDocumentPositionParams, perlDoc: PerlDocument, txtDoc: TextDocument, modMap: Map<string, string>): CompletionItem[] {

    const mods = Array.from(modMap.keys());
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

        if (!prefix.symbol)
		return [];

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

    const canShift = (c: string) => /[\w\:\>\-]/.exec(c);
    let l = position - 1; // left
    for (; l >= 0 && canShift(text[l]); --l)
    	;
    let symbol = text.substring(Math.max(l + 1, 0), position);
    if (l >= 0) {
	const lCh = text[l];
	if (lCh === '$' || lCh === '@' || lCh === '%') {
	    symbol = lCh + symbol;
	    --l;
	}
    }
    return {symbol: symbol, charStart: l, charEnd: position};
}

// First we check if it's an import statement, which is a special type of autocomplete with far more options
function getImportPrefix(text: string, position: number): CompletionPrefix | undefined {

    text = text.substring(0, position);

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

    let bKnownObj = false;
    // Check if we know the type of this object
    let knownObject = /^(\$\w+):(?::\w*)?$/.exec(qualifiedSymbol);
    if(knownObject){
        const targetVar = perlDoc.canonicalElems.get(knownObject[1]);
        if(targetVar){
            qualifiedSymbol = qualifiedSymbol.replace(/^\$\w+(?=:)/, targetVar.typeDetail);
            bKnownObj = true;
        }
    }

    // If the magic variable $self->, then autocomplete to everything in main. 
    const bSelf = /^(\$self):(?::\w*)?$/.exec(qualifiedSymbol);
    if(bSelf) bKnownObj = true;

    // const lcQualifiedSymbol = qualifiedSymbol.toLowerCase(); Case insensitive matches are hard since we restore what you originally matched on

    perlDoc.elems.forEach((elements: PerlElem[], elemName: string) => {
        if (/^[\$\@\%].$/.test(elemName))
	    return; // Remove single character magic perl variables. Mostly clutter the list

        let element = perlDoc.canonicalElems.get(elemName) || elements[0]; // Get the canonical (typed) element, otherwise just grab the first one.

        // All plain and inherited subroutines should match with $self. We're excluding PerlSymbolKind.ImportedSub here because imports clutter the list, despite perl allowing them called on $self->
        if (bSelf && [PerlSymbolKind.LocalSub,
		     PerlSymbolKind.Inherited,
		     PerlSymbolKind.LocalMethod,
		     PerlSymbolKind.Field].includes(element.type))
	    elemName = `$self::${elemName}`;

        if (goodMatch(perlDoc, elemName, qualifiedSymbol, symbol, bKnownObj)) {
            // Hooray, it's a match! 
            // You may have asked for FOO::BAR->BAZ or $qux->BAZ and I found FOO::BAR::BAZ. Let's put back the arrow or variable before sending
            const quotedSymbol = qualifiedSymbol.replace(/([\$])/g, '\\$1'); // quotemeta for $self->FOO
            let aligned = elemName.replace(new RegExp(`^${quotedSymbol}`, 'gi'), symbol);

            if (symbol.endsWith('-'))
	       aligned = aligned.replace(new RegExp(`-:`, 'gi'), '->');  // Half-arrows count too

            // Don't send invalid constructs
	    // like FOO->BAR::BAZ
	    if (/\-\>\w+::/.test(aligned)
	       || /\-\>\w+$/.test(aligned))
		 // FOO->BAR if Bar is not a sub/method.
		 if (![PerlSymbolKind.LocalSub,
                    PerlSymbolKind.ImportedSub,
                    PerlSymbolKind.Inherited,
                    PerlSymbolKind.LocalMethod,
                    PerlSymbolKind.Method,
                    PerlSymbolKind.Field,
                    PerlSymbolKind.PathedField].includes(element.type)
		    || !/^\$.*\-\>\w+$/.test(aligned))
		    // FOO::BAR if Bar is a instance method or attribute (I assume them to be instance methods/attributes, not class)
		     if ([PerlSymbolKind.LocalMethod,
                        PerlSymbolKind.Method,
			PerlSymbolKind.Field,
			PerlSymbolKind.PathedField].includes(element.type)
			|| /-:/.test(aligned) // We look things up like this, but don't let them slip through
			|| /^\$.*::/.test(aligned)) // $Foo::Bar, I don't really hunt for these anyway
		         return;
            matches = matches.concat(buildMatches(aligned, element, replace));
        }
    });

    return matches;

}

// TODO: preprocess all "allowed" matches so we don't waste time iterating over them for every autocomplete.
function goodMatch(perlDoc: PerlDocument, elemName: string, qualifiedSymbol: string, origSymbol: string, bKnownObj: boolean): boolean {
    if (!elemName.startsWith(qualifiedSymbol))
        return false;
    // All uppercase methods are generally private or autogenerated and unhelpful
    if(/(?:::|->)[A-Z][A-Z_]+$/.test(elemName))
        return false;
    if(bKnownObj){
        // If this is a known object type, we probably aren't importing the package or building a new one.
        if (/(?:::|->)(?:new|import)$/.test(elemName))
	    return false;
        // If we known the object type (and variable name is not $self), then exclude the double underscore private variables (rare anyway. single underscore kept, but ranked last in the autocomplete)
        if ((/^(?!\$self)\$/.test(origSymbol) && /(?:::|->)__\w+$/.test(elemName)))
	    return false;
        // Otherwise, always autocomplete, even if the module has not been explicitly imported.
        return true;
    }
    // Get the module name to see if it's been imported. Otherwise, don't allow it.
    let modRg = /^(.+)::.*?$/;
    var match = modRg.exec(elemName);
    if (match && !perlDoc.imported.has(match[1])) {
        // TODO: Allow completion on packages/class defined within the file itself (e.g. Foo->new, $foo->new already works)
        // Thing looks like a module, but was not explicitly imported
        return false;
    } else {
        // Thing was either explictly imported or not a module function
        return true;
    }
}

function buildMatches(lookupName: string, elem: PerlElem, range: Range): CompletionItem[] {

    let kind: CompletionItemKind;
    let detail: string | undefined = undefined;
    let documentation: MarkupContent | undefined = undefined;
    let docs: string[] = [];

    if ([PerlSymbolKind.LocalVar,
	PerlSymbolKind.ImportedVar,
	PerlSymbolKind.Canonical].includes(elem.type)) {
        if (elem.typeDetail.length > 0) {
    	    kind = CompletionItemKind.Variable;
    	    detail = `${lookupName}: ${elem.typeDetail}`;
        } else if (lookupName == '$self') {
    	    kind = CompletionItemKind.Variable;
    	    // elem.package can be misleading if you use $self in two different packages in the same module. Get scoped matches will address this
    	    detail = `${lookupName}: ${elem.package}`; 
        }
    }
    if(!detail){
        switch (elem.type) {
        case PerlSymbolKind.LocalVar: 
            kind = CompletionItemKind.Variable;
            break;
        case PerlSymbolKind.ImportedVar: 
            kind = CompletionItemKind.Constant;
            // detail = elem.name;
            docs.push(elem.name);
            docs.push(`Value: ${elem.value}`);
            break;
        case PerlSymbolKind.ImportedHash:
        case PerlSymbolKind.Constant:
            kind = CompletionItemKind.Constant;
            break;
        case PerlSymbolKind.LocalSub:
            if (/^\$self\-/.test(lookupName))
                docs.push(elem.name); // For consistency with the other $self methods. VScode seems to hide documentation if less populated?
            kind = CompletionItemKind.Function;
            break;
        case PerlSymbolKind.ImportedSub:
        case PerlSymbolKind.Inherited:
        case PerlSymbolKind.Method:
        case PerlSymbolKind.LocalMethod:
            kind = CompletionItemKind.Method;
            docs.push(elem.name);
            if (elem.typeDetail && elem.typeDetail != elem.name)
                docs.push(`\nDefined as:\n  ${elem.typeDetail}`);
            break;
        case PerlSymbolKind.Package:
        case PerlSymbolKind.Module:
            kind = CompletionItemKind.Module;
            break;
        case PerlSymbolKind.Label: // Loop labels
            kind = CompletionItemKind.Reference;
            break;
        case PerlSymbolKind.Class:
            kind = CompletionItemKind.Class;
            break;
        case PerlSymbolKind.Role:
            kind = CompletionItemKind.Interface;
            break;
        case PerlSymbolKind.Field:
        case PerlSymbolKind.PathedField:
            kind = CompletionItemKind.Field;
            break;
        case PerlSymbolKind.Phaser:
        case PerlSymbolKind.HttpRoute:
        case PerlSymbolKind.OutlineOnlySub:
            return [];
        default: // A sign that something needs fixing. Everything should've been enumerated.
            kind = CompletionItemKind.Property;
            break;
        }
    }
    if (docs.length > 0)
        documentation = {kind: "markdown", value: "```\n" + docs.join("\n") + "\n```" };
    
    let labelsToBuild = [lookupName];

    if(/::new$/.test(lookupName)){
        // Having ->new at the top (- sorts before :) is the more common way to call packages (although you can call it either way).
        labelsToBuild.push(lookupName.replace(/::new$/, "->new"));
    }

    let matches: CompletionItem[] = [];

    labelsToBuild.forEach(label => {
        matches.push({
            label: label,
            textEdit: {newText: label, range},
            kind: kind,
            sortText: getSortText(label),
            detail: detail,
            documentation: documentation,
        });
    });

    return matches
}

function getSortText(label: string): string {
    // Ensure sorting has public methods up front, followed by private and then capital. (private vs somewhat capital is arbitrary, but public makes sense).
    // Variables will still be higher when relevant. 
    // use English puts a lot of capital variables, so these will end up lower as well (including Hungarian notation capitals)

    let sortText: string;

    if(/^[@\$%]?[a-z]?[a-z]?[A-Z][A-Z_]*$/.test(label) || /(?:::|->)[A-Z][A-Z_]+$/.test(label)){
        sortText = "4" + label;
    } else if(/^_$/.test(label) || /(?:::|->)_\w+$/.test(label)){
        sortText = "3" + label;
    } else if(/^\w$/.test(label) || /(?:::|->)\w+$/.test(label)){
        // Public methods / functions
        sortText = "2";
        // Prioritize '->new'
        if (/->new/.test(label)) { sortText += "1" }
        sortText += label;
    } else {
        // Variables and regex mistakes
        sortText = "1" + label;
    }
    return sortText;
}
