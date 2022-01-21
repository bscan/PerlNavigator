import {
    DefinitionParams,
    Location,
} from 'vscode-languageserver/node';
import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem } from "./types";
import Uri from 'vscode-uri';


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

    perlDoc.elems.set(items[0], newElem);

    return;
}


function getSymbol(text: string, position: number) {
    // Common word separators. The ones not included are : and > to look for modules and methods
    // Also excludes $, @, % as well to differentiate between variables and modules
    // For now I won't differentiate between $foo{1} being %foo vs $foo

    // Ignore :: going left, but stop at :: when going to the right. (e.g Foo::bar::baz should be clickable on each spot)
    // Todo: rewrite this allowed chars instead of banned ones. Would be smaller.
    const leftSep  = (c: string) => /[`~!#\^&\*\(\)\-=\+\[{\]}\\\|\;'\",\.<\/\?\s]/.exec(c);
    const rightSep = (c: string) => /[`~!#\^&\*\(\)\-=\+\[{\]}\\\|\;'\",\.<\/\?\s:\@\$\%\>]/.exec(c);

    let left = position - 1;
    let right = position;

    while (left >= 0 && !leftSep(text[left])) {
        left -= 1;
    }
    left = Math.max(0, left + 1);

    while (right < text.length && !rightSep(text[right])) {
        right += 1;
    }
    right = Math.max(left, right);
    return text.substring(left, right);
}

export function getDefinition(params: DefinitionParams, perlDoc: PerlDocument, txtDoc: TextDocument): Location | undefined {
    console.log("Received an ondefinition request!");
    let position = params.position

    const start = { line: position.line, character: 0 };
    const end = { line: position.line + 1, character: 0 };
    const text = txtDoc.getText({ start, end });
    console.log("Inspecting " + text);

    const index = txtDoc.offsetAt(position) - txtDoc.offsetAt(start);
    const word = getSymbol(text, index);

    console.log("Looking for: " + word + "?");
    if(!word) return;

    const found = perlDoc.elems.get(word);

    if( found ){
        console.log("Hooray, the value exists");
        console.log(found.line);
    } else {
        // Many reasons that we didn't find the symbol
        // TODO: Add support for -> vs :: methods, and $ vs @ vs %
        // Why do we store the module name at all?     
        // Dynamically assigned *my_sub = ?? See Cwd.pm and DataFrame for examples   
        console.log("Could not find word.");
        return;
    }

    if(!found.file) return;

    const lineNum = found.line < 1 ? 0 : found.line-1;

    let uri =  Uri.file(found.file).toString();
    console.log("Sending to " + uri);
    const myLoc: Location = {
        uri: uri,
        range: { 
            start: { line: lineNum, character: 0 },
            end: { line: lineNum, character: 500}
            }
    }

    return myLoc;
}