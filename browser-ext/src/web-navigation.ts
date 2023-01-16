import {
    DefinitionParams,
    Location,
    WorkspaceFolder
} from 'vscode-languageserver/browser';
import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem, NavigatorSettings } from "./web-types";
import { realpathSync, existsSync, realpath } from 'fs';
import { getSymbol, lookupSymbol } from "./web-utils";


export function getDefinition(params: DefinitionParams, perlDoc: PerlDocument, txtDoc: TextDocument): Location[] | undefined {
    
    let position = params.position
    const symbol = getSymbol(position, txtDoc);

    if(!symbol) return;

    const foundElems = lookupSymbol(perlDoc, symbol, position.line);

    if(foundElems.length == 0){
        return;
    }

    let locationsFound: Location[] = [];
    
    foundElems.forEach(elem => {
        const elemResolved: PerlElem | undefined = resolveElemForNav(perlDoc, elem, symbol);
        if(!elemResolved) return;

        let uri: string;
        if(perlDoc.uri !== elemResolved.file){ // TODO Compare URI instead
            // If sending to a different file, let's make sure it exists and clean up the path
            // if(!existsSync(elemResolved.file)) return; // Make sure the file exists and hasn't been deleted.
            //uri =  elemResolved.file
            console.log("Different file");
            console.log(elemResolved.file);
            console.log(perlDoc.filePath);
            return;
        } else {
            // Sending to current file (including untitled files)
            uri = perlDoc.uri;
        }

        const newLoc: Location = {
            uri: uri,
            range: { 
                start: { line: elemResolved.line, character: 0 },
                end: { line: elemResolved.line, character: 500}
                }
        }
        locationsFound.push(newLoc);
    });    
    return locationsFound;
}


function resolveElemForNav (perlDoc: PerlDocument, elem: PerlElem, symbol: string): PerlElem | undefined {
    
    if(elem.file && !badFile(elem.file)){
        // Have file and is good.
        return elem;
    } else{
        // Try looking it up by package instead of file.
        // Happens with XS subs and Moo subs
        if(elem.package){
            const elemResolved = perlDoc.elems.get(elem.package);

            if(elemResolved?.length && elemResolved[0].file && !badFile(elem.file)){
                return elemResolved[0];
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
