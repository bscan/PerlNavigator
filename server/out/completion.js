"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCompletions = void 0;
const node_1 = require("vscode-languageserver/node");
function getCompletions(params, perlDoc, txtDoc, modMap) {
    const mods = Array.from(modMap.keys());
    let position = params.position;
    const start = { line: position.line, character: 0 };
    const end = { line: position.line + 1, character: 0 };
    const text = txtDoc.getText({ start, end });
    const index = txtDoc.offsetAt(position) - txtDoc.offsetAt(start);
    const imPrefix = getImportPrefix(text, index);
    if (imPrefix) {
        const replace = {
            start: { line: position.line, character: imPrefix.charStart },
            end: { line: position.line, character: imPrefix.charEnd }
        };
        const matches = getImportMatches(mods, imPrefix.symbol, replace);
        return matches;
    }
    else {
        const prefix = getPrefix(text, index);
        if (!prefix.symbol)
            return [];
        console.log("Looking at prefix: " + prefix.symbol);
        const replace = {
            start: { line: position.line, character: prefix.charStart },
            end: { line: position.line, character: prefix.charEnd }
        };
        const matches = getMatches(perlDoc, prefix.symbol, replace);
        return matches;
    }
}
exports.getCompletions = getCompletions;
// Similar to getSymbol for navigation, but don't "move right". 
function getPrefix(text, position) {
    const leftAllow = (c) => /[\w\:\>\-]/.exec(c);
    let left = position - 1;
    while (left >= 0 && leftAllow(text[left])) {
        left -= 1;
    }
    left = Math.max(0, left + 1);
    let symbol = text.substring(left, position);
    const lChar = left > 0 ? text[left - 1] : "";
    if (lChar === '$' || lChar === '@' || lChar === '%') {
        symbol = lChar + symbol;
        left -= 1;
    }
    return { symbol: symbol, charStart: left, charEnd: position };
}
// First we check if it's an import statement, which is a special type of autocomplete with far more options
function getImportPrefix(text, position) {
    text = text.substring(0, position);
    let partialImport = /^\s*(?:use|require)\s+([\w:]+)$/.exec(text);
    if (!partialImport)
        return;
    const symbol = partialImport[1];
    return { symbol: symbol, charStart: position - symbol.length, charEnd: position };
}
function getImportMatches(mods, symbol, replace) {
    const matches = [];
    const lcSymbol = symbol.toLowerCase();
    mods.forEach(mod => {
        if (mod.toLowerCase().startsWith(lcSymbol)) {
            matches.push({
                label: mod,
                textEdit: { newText: mod, range: replace },
                kind: node_1.CompletionItemKind.Module,
            });
        }
    });
    return matches;
}
function getMatches(perlDoc, symbol, replace) {
    let matches = [];
    let qualifiedSymbol = symbol.replace(/->/g, "::"); // Module->method() can be found via Module::method
    qualifiedSymbol = qualifiedSymbol.replace(/-$/g, ":"); // Maybe I just started typing Module-
    let bKnownObj = false;
    // Check if we know the type of this object
    let knownObject = /^(\$\w+):(?::\w*)?$/.exec(qualifiedSymbol);
    if (knownObject) {
        const targetVar = perlDoc.canonicalElems.get(knownObject[1]);
        if (targetVar) {
            qualifiedSymbol = qualifiedSymbol.replace(/^\$\w+(?=:)/, targetVar.type);
            bKnownObj = true;
        }
    }
    // If the magic variable $self->, then autocomplete to everything in main. 
    const bSelf = /^(\$self):(?::\w*)?$/.exec(qualifiedSymbol);
    if (bSelf)
        bKnownObj = true;
    // const lcQualifiedSymbol = qualifiedSymbol.toLowerCase(); Case insensitive matches are hard since we restore what you originally matched on
    perlDoc.elems.forEach((elements, elemName) => {
        if (/^[\$\@\%].$/.test(elemName))
            return; // Remove single character magic perl variables. Mostly clutter the list
        let element = perlDoc.canonicalElems.get(elemName) || elements[0]; // Get the canonical (typed) element, otherwise just grab the first one.
        // All plain and inherited subroutines should match with $self. We're excluding methods here because imports clutter the list, despite perl allowing them called on $self->
        if (bSelf && ["s", "i"].includes(element.type))
            elemName = `$self::${elemName}`;
        if (goodMatch(perlDoc, elemName, qualifiedSymbol, bKnownObj)) {
            // Hooray, it's a match! 
            // You may have asked for FOO::BAR->BAZ or $qux->BAZ and I found FOO::BAR::BAZ. Let's put back the arrow or variable before sending
            const quotedSymbol = qualifiedSymbol.replace(/([\$])/g, '\\$1'); // quotemeta for $self->FOO
            let aligned = elemName.replace(new RegExp(`^${quotedSymbol}`, 'gi'), symbol);
            // console.log(`${symbol} became ${qualifiedSymbol} and matched with ${elemName}, so we displayed: ${aligned}`);
            if (symbol.endsWith('-'))
                aligned = aligned.replace(new RegExp(`-:`, 'gi'), '->'); // Half-arrows count too
            // Don't send invalid constructs
            if (/\-\>\w+::/.test(aligned) || // like FOO->BAR::BAZ
                (/\-\>\w+$/.test(aligned) && !["s", "t", "i"].includes(element.type)) || // FOO->BAR if Bar is not a sub/method.
                (/^\$.*::/.test(aligned)) // $Foo::Bar, I don't really hunt for these anyway             
            )
                return;
            matches = matches.concat(buildMatches(aligned, element, replace));
        }
    });
    return matches;
}
// TODO: preprocess all "allowed" matches so we don't waste time iterating over them for every autocomplete.
function goodMatch(perlDoc, elemName, qualifiedSymbol, bKnownObj) {
    if (!elemName.startsWith(qualifiedSymbol))
        return false;
    if (bKnownObj)
        return true;
    // Get the module name to see if it's been imported. Otherwise, don't allow it.
    let modRg = /^(.+)::.*?$/;
    var match = modRg.exec(elemName);
    if (match && !perlDoc.imported.has(match[1])) {
        // Thing looks like a module, but was not explicitly imported
        return false;
    }
    else {
        // Thing was either explictly imported or not a module function
        return true;
    }
}
function buildMatches(lookupName, elem, range) {
    let kind;
    let detail = undefined;
    let documentation = undefined;
    let docs = [];
    if (elem.type.length > 1 || (["v", "c"].includes(elem.type) && lookupName == '$self')) {
        // We either know the object type, or it's $self
        kind = node_1.CompletionItemKind.Variable;
        if (elem.type.length > 1) {
            detail = `${lookupName}: ${elem.type}`;
        }
        else if (lookupName == '$self') {
            // elem.package can be misleading if you use $self in two different packages in the same module. Get scoped matches will address this
            detail = `${lookupName}: ${elem.package}`;
        }
    }
    else if (elem.type == 'v') {
        kind = node_1.CompletionItemKind.Variable;
    }
    else if (elem.type == 'c') {
        kind = node_1.CompletionItemKind.Constant;
        // detail = elem.name;
        docs.push(elem.name);
        docs.push(`Value: ${elem.value}`);
    }
    else if (elem.type == 'h') {
        kind = node_1.CompletionItemKind.Constant;
    }
    else if (elem.type == 's') {
        if (/^\$self\-/.test(lookupName))
            docs.push(elem.name); // For consistency with the other $self methods. VScode seems to hide documentation if less populated?
        kind = node_1.CompletionItemKind.Function;
    }
    else if (elem.type == 't' || elem.type == 'i') {
        kind = node_1.CompletionItemKind.Method;
        docs.push(elem.name);
        if (elem.typeDetail && elem.typeDetail != elem.name)
            docs.push(`\nDefined as:\n  ${elem.typeDetail}`);
    }
    else if (elem.type == 'p' || elem.type == 'm') {
        kind = node_1.CompletionItemKind.Module;
    }
    else if (elem.type == 'l') { // Loop labels
        kind = node_1.CompletionItemKind.Reference;
    }
    else {
        // A sign that something needs fixing. Everything should've been enumerated. 
        kind = node_1.CompletionItemKind.Property;
    }
    if (docs.length > 0) {
        documentation = { kind: "markdown", value: "```\n" + docs.join("\n") + "\n```" };
    }
    let labelsToBuild = [lookupName];
    if (/::new$/.test(lookupName)) {
        // Having ->new at the top (- sorts before :) is the more common way to call packages (although you can call it either way).
        labelsToBuild.push(lookupName.replace(/::new$/, "->new"));
    }
    let matches = [];
    labelsToBuild.forEach(label => {
        matches.push({
            label: label,
            textEdit: { newText: label, range },
            kind: kind,
            sortText: getSortText(label),
            detail: detail,
            documentation: documentation,
        });
    });
    return matches;
}
function getSortText(label) {
    // Ensure sorting has public methods up front, followed by private and then capital. (private vs somewhat capital is arbitrary, but public makes sense).
    // Variables will still be higher when relevant. 
    // use English puts a lot of capital variables, so these will end up lower as well (including Hungarian notation capitals)
    let sortText;
    if (/^[@\$%]?[a-z]?[a-z]?[A-Z][A-Z_]*$/.test(label) || /(?:::|->)[A-Z][A-Z_]+$/.test(label)) {
        sortText = "4" + label;
    }
    else if (/^_$/.test(label) || /(?:::|->)_\w+$/.test(label)) {
        sortText = "3" + label;
    }
    else if (/^\w$/.test(label) || /(?:::|->)\w+$/.test(label)) {
        // Public methods / functions
        sortText = "2" + label;
    }
    else {
        // Variables and regex mistakes
        sortText = "1" + label;
    }
    return sortText;
}
//# sourceMappingURL=completion.js.map