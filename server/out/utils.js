"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nLog = exports.lookupSymbol = exports.getSymbol = exports.getIncPaths = exports.async_execFile = void 0;
const vscode_uri_1 = require("vscode-uri");
const child_process_1 = require("child_process");
const util_1 = require("util");
exports.async_execFile = (0, util_1.promisify)(child_process_1.execFile);
// TODO: This behaviour should be temporary. Review and update treatment of multi-root workspaces
function getIncPaths(workspaceFolders, settings) {
    let includePaths = [];
    settings.includePaths.forEach(path => {
        if (/\$workspaceFolder/.test(path)) {
            if (workspaceFolders) {
                workspaceFolders.forEach(workspaceFolder => {
                    const incPath = vscode_uri_1.default.parse(workspaceFolder.uri).fsPath;
                    includePaths = includePaths.concat(["-I", path.replace(/\$workspaceFolder/g, incPath)]);
                });
            }
            else {
                nLog("You used $workspaceFolder in your config, but didn't add any workspace folders. Skipping " + path, settings);
            }
        }
        else {
            includePaths = includePaths.concat(["-I", path]);
        }
    });
    return includePaths;
}
exports.getIncPaths = getIncPaths;
function getSymbol(position, txtDoc) {
    // Gets symbol from text at position. 
    // Ignore :: going left, but stop at :: when going to the right. (e.g Foo::bar::baz should be clickable on each spot)
    // Todo: Only allow -> once.
    // Used for navigation and hover.
    const start = { line: position.line, character: 0 };
    const end = { line: position.line + 1, character: 0 };
    const text = txtDoc.getText({ start, end });
    const index = txtDoc.offsetAt(position) - txtDoc.offsetAt(start);
    const leftRg = /[\p{L}\p{N}_:>-]/u;
    const rightRg = /[\p{L}\p{N}_]/u;
    const leftAllow = (c) => leftRg.exec(c);
    const rightAllow = (c) => rightRg.exec(c);
    let left = index - 1;
    let right = index;
    while (left >= 0 && leftAllow(text[left])) {
        left -= 1;
    }
    left = Math.max(0, left + 1);
    while (right < text.length && rightAllow(text[right])) {
        right += 1;
    }
    right = Math.max(left, right);
    let symbol = text.substring(left, right);
    const lChar = left > 0 ? text[left - 1] : "";
    const llChar = left > 1 ? text[left - 2] : "";
    const rChar = right < text.length ? text[right] : "";
    if (lChar === '$') {
        if (rChar === '[' && llChar != '$') {
            symbol = '@' + symbol; // $foo[1] -> @foo  $$foo[1] -> $foo
        }
        else if (rChar === '{' && llChar != '$') {
            symbol = '%' + symbol; // $foo{1} -> %foo   $$foo{1} -> $foo
        }
        else {
            symbol = '$' + symbol; //  $foo  $foo->[1]  $foo->{1} -> $foo
        }
    }
    else if (['@', '%'].includes(lChar)) {
        symbol = lChar + symbol; // @foo, %foo -> @foo, %foo
    }
    else if (lChar === '{' && rChar === '}' && ["$", "%", "@"].includes(llChar)) {
        symbol = llChar + symbol; // ${foo} -> $foo
    }
    return symbol;
}
exports.getSymbol = getSymbol;
function lookupSymbol(perlDoc, symbol, line) {
    let found = perlDoc.elems.get(symbol);
    if (found === null || found === void 0 ? void 0 : found.length) {
        // Simple lookup worked. If we have multiple (e.g. 2 lexical variables), find the nearest earlier declaration. 
        let best = found[0];
        for (var i = 0; i < found.length; i++) {
            if (found[i].line > best.line && found[i].line <= line) {
                best = found[i];
            }
        }
        ;
        return [best];
    }
    let qSymbol = symbol;
    let knownObject = /^(\$\w+)\->(?:\w+)$/.exec(symbol);
    if (knownObject) {
        const targetVar = perlDoc.canonicalElems.get(knownObject[1]);
        if (targetVar)
            qSymbol = qSymbol.replace(/^\$\w+(?=\->)/, targetVar.type);
    }
    // Add what we mean when someone wants ->new().
    let synonyms = ['_init', 'BUILD'];
    for (const synonym of synonyms) {
        found = perlDoc.elems.get(symbol.replace(/->new$/, "::" + synonym));
        if (found === null || found === void 0 ? void 0 : found.length)
            return [found[0]];
    }
    found = perlDoc.elems.get(symbol.replace(/DBI->new$/, "DBI::connect"));
    if (found === null || found === void 0 ? void 0 : found.length)
        return [found[0]];
    qSymbol = qSymbol.replace(/->/g, "::"); // Module->method() can be found via Module::method
    found = perlDoc.elems.get(qSymbol);
    if (found === null || found === void 0 ? void 0 : found.length)
        return [found[0]];
    if (qSymbol.includes('::')) {
        // Seems like we should only hunt for -> funcs not ::, but I'm not sure it can hurt. We're already unable to find it.
        // One example where ithelps is SamePackageSubs
        // if(symbol.includes('->')){
        const method = qSymbol.split('::').pop();
        if (method) {
            // Perhaps the method is within our current scope, or explictly imported. 
            found = perlDoc.elems.get(method);
            if (found === null || found === void 0 ? void 0 : found.length)
                return [found[0]];
            // Haven't found the method yet, let's check if anything could be a possible match since you don't know the object type
            let foundElems = [];
            perlDoc.elems.forEach((elements, elemName) => {
                const element = elements[0]; // All Elements are with same name are normally the same.
                const elemMethod = elemName.split('::').pop();
                if (elemMethod == method) {
                    foundElems.push(element);
                }
            });
            if (foundElems.length > 0)
                return foundElems;
        }
    }
    return [];
}
exports.lookupSymbol = lookupSymbol;
function nLog(message, settings) {
    // TODO: Remove resource level settings and just use a global logging setting?
    if (settings.logging) {
        console.log(message);
    }
}
exports.nLog = nLog;
//# sourceMappingURL=utils.js.map