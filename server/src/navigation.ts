import {
    DefinitionParams,
    Location,
    WorkspaceFolder
} from 'vscode-languageserver/node';
import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem, NavigatorSettings } from "./types";
import Uri from 'vscode-uri';
import { realpathSync, existsSync } from 'fs';
import { getIncPaths, async_execFile} from "./utils";
import { dirname, join } from 'path';



function getSymbol(text: string, position: number) {
    // Gets symbol from text at position. 
    // Ignore :: going left, but stop at :: when going to the right. (e.g Foo::bar::baz should be clickable on each spot)
    // Todo: Only allow -> once.
    const leftAllow  = (c: string) => /[\w\:\>\-]/.exec(c);
    const rightAllow = (c: string) => /[\w]/.exec(c);

    let left = position - 1;
    let right = position;

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
    let position = params.position
    const start = { line: position.line, character: 0 };
    const end = { line: position.line + 1, character: 0 };
    const text = txtDoc.getText({ start, end });

    const index = txtDoc.offsetAt(position) - txtDoc.offsetAt(start);
    const symbol = getSymbol(text, index);

    if(!symbol) return;
    console.log("Looking for: " + symbol);

    const foundElems = lookupSymbol(perlDoc, symbol);

    if(foundElems.length == 0){
        console.log("Could not find word: " + symbol);
        return;
    }

    let locationsFound: Location[] = [];
    
    foundElems.forEach(elem => {
        const elemResolved: PerlElem | undefined = resolveElem(perlDoc, elem, symbol);
        if(!elemResolved) return;
        const lineNum = elemResolved.line < 1 ? 0 : elemResolved.line-1;

        // TODO: make this whole thing async
        if(!existsSync(elemResolved.file)) return; // Make sure the file exists and hasn't been deleted.
        let uri =  Uri.file(realpathSync(elemResolved.file)).toString(); // Resolve symlinks
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

    let qSymbol = symbol;
    let knownObject = /^(\$\w+)\->(?:\w+)$/.exec(symbol);
    if(knownObject){
        const targetVar = perlDoc.vartypes.get(knownObject[1]);
        if(targetVar) qSymbol = qSymbol.replace(/^\$\w+(?=\->)/, targetVar.type);
    }

    // Add what we mean when someone wants ->new().
    let synonyms = ['_init', 'BUILD'];
    for (const synonym of synonyms){
        found = perlDoc.elems.get(symbol.replace(/->new$/, "::" + synonym));
        if(found) return [found];
    }
    found = perlDoc.elems.get(symbol.replace(/DBI->new$/, "DBI::connect"));
    if(found) return [found];
    

    qSymbol = qSymbol.replace(/->/g, "::"); // Module->method() can be found via Module::method
    found = perlDoc.elems.get(qSymbol);
    if(found) return [found];

    if(qSymbol.includes('::')){
    // Seems like we should only hunt for -> funcs not ::, but I'm not sure it can hurt. We're already unable to find it.
    // One example where ithelps is SamePackageSubs
    // if(symbol.includes('->')){
        const method = qSymbol.split('::').pop();
        console.log(`qualifiedSymbol ${qSymbol}   and method ${method}`);
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
        // Try looking it up by package instead of file.
        // Happens with XS subs and Moo subs
        if(elem.package){
            const elemResolved = perlDoc.elems.get(elem.package);
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


export async function getAvailableMods(workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): Promise<string[]> {
       
    let perlParams: string[] = [];
    perlParams = perlParams.concat(getIncPaths(workspaceFolders, settings));
    const modHunterPath = join(dirname(__dirname), 'src', 'perl', 'lib_bs22', 'ModHunter.pl');
    perlParams.push(modHunterPath);
    console.log("Starting to look for perl modules with " + perlParams.join(" "));

    const mods: string[] = [];

    let output: string;
    try {
        // This can be slow, especially if reading modules over a network or on windows. 
        const out = await async_execFile(settings.perlPath, perlParams, {timeout: 90000, maxBuffer: 3 * 1024 * 1024});
        output = out.stdout;
        console.log("Success running mod hunter");
    } catch(error: any) {
        console.log("ModHunter failed. You will lose autocomplete on importing modules. Not a huge deal");
        console.log(error);
        return mods;
    }

    output.split("\n").forEach(mod => {
        var items = mod.split('\t');

        if(items.length != 4 || items[1] != 'M' || !items[2]){
            return;
        }
        mods.push(items[2]);
    });
    return mods;
}
