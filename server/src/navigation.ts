import {
    DefinitionParams,
    Location,
} from 'vscode-languageserver/node';
import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem } from "./types";
import Uri from 'vscode-uri';
import { realpathSync } from 'fs';

export async function buildNav(stdout: string): Promise<PerlDocument> {

    // Strip off anything printed from before our perl CHECK block. TODO: is this slow? 
    stdout = stdout.replace(/.*6993a1bd-f3bf-4006-9993-b53e45527147\n/s, "");
    stdout = stdout.replace(/\r/sg, ""); // Windows 

    let perlDoc: PerlDocument = { elems: new Map() };

    stdout.split("\n").forEach(perl_elem => {
        parseElem(perl_elem, perlDoc);
    });
    
    return perlDoc;
}


function parseElem(perlTag: string, perlDoc: PerlDocument): void {

    var items = perlTag.split('\t');

    if(items.length != 6){
        return;
    }
    if (!items[0] || items[0]=='_') return; // Need a look-up key

    const name    = items[0];
    const type    = (!items[1] || items[1] == '_') ? "": items[1]; 
    const file    = (!items[2] || items[2] == '_') ? "": items[2]; 
    const module  = (!items[3] || items[3] == '_') ? "": items[3]; 
    const lineNum = (!items[4] || items[4] == '_') ? 0: +items[4]; 
    const value   = (!items[5] || items[5] == '_') ? "": items[5]; 


    const newElem: PerlElem = {
        type: type,
        file: file,
        module: module,
        line: lineNum,
        value: value,
    };

    perlDoc.elems.set(name, newElem);

    return;
}


function getSymbol(text: string, position: number) {
    // Gets symbol from text at position. 
    // Ignore :: going left, but stop at :: when going to the right. (e.g Foo::bar::baz should be clickable on each spot)
    // Todo: Only allow -> once.
    const leftAllow  = (c: string) => /[\w\:\>\-]/.exec(c);
    const rightAllow = (c: string) => /[\w]/.exec(c);

    let left = position - 1;
    let right = position;

    console.log()
    while (left >= 0 && leftAllow(text[left])) {
        left -= 1;
    }
    left = Math.max(0, left + 1);
    while (right < text.length && rightAllow(text[right])) {
        right += 1;
    }
    right = Math.max(left, right);

    let symbol = text.substring(left, right);
    const lChar  = left > 0 ? text[left-1] : "";
    const llChar = left > 1 ? text[left-2] : "";
    const rChar  = right < text.length  ? text[right] : "";
    console.log("ll: " + llChar + "  l:" + lChar + "  r:" + rChar);

    if(lChar === '$'){
        if(rChar === '['){
            symbol = '@' + symbol; // $foo[1] -> @foo
        }else if(rChar === '{'){    
            symbol = '%' + symbol; // $foo{1} -> %foo
        }else{
            symbol = '$' + symbol; // $foo, $foo->[1], $foo->{1} -> $foo
        }
    }else if(lChar === '@' || lChar === '%'){ 
        symbol = lChar + symbol;   // @foo, %foo -> @foo, %foo
    }else if(lChar === '{' && rChar === '}' && ["$", "%", "@"].includes(llChar)){
        symbol = llChar + symbol;  // ${foo} -> $foo
    }

    return symbol;
}

export function getDefinition(params: DefinitionParams, perlDoc: PerlDocument, txtDoc: TextDocument): Location[] | undefined {
    console.log("Received an ondefinition request!");
    let position = params.position

    const start = { line: position.line, character: 0 };
    const end = { line: position.line + 1, character: 0 };
    const text = txtDoc.getText({ start, end });
    console.log("Inspecting " + text);

    const index = txtDoc.offsetAt(position) - txtDoc.offsetAt(start);
    const symbol = getSymbol(text, index);

    console.log("Looking for: " + symbol + "?");
    if(!symbol) return;

    const foundElems = lookupSymbol(perlDoc, symbol);

    if(foundElems.length == 0){
        // Dynamically assigned *my_sub = ?? See Cwd.pm and DataFrame for examples   
        console.log("Could not find word: " + symbol);
        return;
    }

    let locationsFound: Location[] = [];
    
    foundElems.forEach(elem => {
        const elemResolved: PerlElem | undefined = resolveElem(perlDoc, elem, symbol);
        if(!elemResolved) return;
        const lineNum = elemResolved.line < 1 ? 0 : elemResolved.line-1;

        // TODO: make this whole thing async
        let uri =  Uri.file(realpathSync(elemResolved.file)).toString();
        console.log("Sending to " + uri);
        const newLoc: Location = {
            uri: uri,
            range: { 
                start: { line: lineNum, character: 0 },
                end: { line: lineNum, character: 500}
                }
        }
        locationsFound.push(newLoc);
    });    
    return locationsFound;
}

function lookupSymbol(perlDoc: PerlDocument, symbol: string): PerlElem[] {
    if(!symbol) return [];

    let found = perlDoc.elems.get(symbol);
    if(found) return [found];

    const qualifiedSymbol = symbol.replace("->", "::"); // Module->method() can be found via Module::method
    found = perlDoc.elems.get(qualifiedSymbol);
    if(found) return [found];

    if(qualifiedSymbol.includes('::')){
    // Seems like we should only hunt for -> funcs not ::, but I'm not sure it can hurt. We're already unable to find it.
    // One example where ithelps is SamePackageSubs
    // if(symbol.includes('->')){
        const method = qualifiedSymbol.split('::').pop();
        if(method){
            // Perhaps the method is within our current scope, or explictly imported. 
            found = perlDoc.elems.get(method);
            if(found) return [found];
            // Haven't found the method yet, let's check if anything could be a possible match since you don't know the object type
            let foundElems: PerlElem[] = [];
            perlDoc.elems.forEach((element: PerlElem, elemName: string) => {
                const elemMethod = elemName.split('::').pop();
                if(elemMethod == method){
                    foundElems.push(element);
                } 
            });
            if(foundElems.length > 0) return foundElems;
        }
    }

    return [];
}

function resolveElem (perlDoc: PerlDocument, elem: PerlElem, symbol: string): PerlElem | undefined {
    
    if(elem.file && !badFile(elem.file)){
        // Have file and is good.
        return elem;
    } else{
        // Try looking it up by module instead of file.
        // Happens with XS subs and Moo subs
        if(elem.module){
            const elemResolved = perlDoc.elems.get(elem.module);
            if(elemResolved && elemResolved.file && !badFile(elem.file)){
                return elemResolved;
            }
        }

        // Finding the module with the stored mod didn't work. Let's try navigating to the package itself instead of Foo::Bar->method().
        // Many Moose methods end up here.
        // Not very helpful, since the user can simply click on the module manually if they want
        // const base_module = symbol.match(/^([\w:]+)->\w+$/);
        // if(base_module){
        //     const elemResolved = perlDoc.elems.get(base_module);
        //     if(elemResolved && elemResolved.file && !badFile(elem.file)){
        //         return elemResolved;
        //     }
        // }
    }
    return;
}

function badFile (file: string){
    return /(?:Sub[\\\/]Defer\.pm|Moo[\\\/]Object\.pm|Moose[\\\/]Object\.pm)$/.test(file);
}