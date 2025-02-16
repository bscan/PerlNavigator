
import { PerlDocument, PerlElem,  PerlSymbolKind, ParseType} from "./web-types";
import { TextDocument } from 'vscode-languageserver-textdocument';

import vsctm = require('vscode-textmate');
import oniguruma = require('vscode-oniguruma');

function init_doc (textDocument: TextDocument): PerlDocument {


    let perlDoc: PerlDocument = {
        elems: new Map(),
        canonicalElems: new Map(),
        autoloads: new Map(),
        imported: new Map(),
        parents: new Map(),
        filePath: '',
        uri: textDocument.uri,
    };

    return perlDoc;
}

type ParserState = {
    stmt: string;
    line_number: number;
    var_continues: boolean;
    package_name: string;
    file: string;
    perlDoc: PerlDocument;
    parseType: ParseType;
    codeArray: string[];
};

type ParseFunc = (state: ParserState) => boolean;



export async function parseDocument(textDocument: TextDocument, parseType: ParseType ): Promise<PerlDocument> {
   
    let parseFunctions: ParseFunc[] = [];
    if(parseType == ParseType.outline){
        parseFunctions = [packages, subs, labels, constants, fields, imports, dancer];
    } else if(parseType == ParseType.selfNavigation){
        parseFunctions = [knownObj, localVars, packages, subs, labels, constants, fields, imports, autoloads, dancer];
    }

    let perlDoc = init_doc(textDocument);

    let state: ParserState = {
        stmt: '',
        line_number: 0,
        package_name: '',
        perlDoc: perlDoc,
        file: textDocument.uri,
        var_continues: false,
        codeArray: await cleanCode(textDocument, perlDoc, parseType),
        parseType: parseType
    };


    for (state.line_number= 0; state.line_number < state.codeArray.length; state.line_number++) {
        state.stmt = state.codeArray[state.line_number];
        // Nothing left? Never mind.
        if (!state.stmt) {
            continue;
        }
           
        parseFunctions.some(fn => fn(state));
    }
    return perlDoc;    
}


function knownObj(state: ParserState) : boolean{
    let match;
    
        // TODO, allow specifying list of constructor names as config
        // Declaring an object. Let's store the type
        // my $constructors = qr/(?:new|connect)/;
    if( (match = state.stmt.match(/^(?:my|our|local|state)\s+(\$\w+)\s*\=\s*([\w\:]+)\-\>new\s*(?:\((?!.*\)\->)|;)/ )) ||
        (match = state.stmt.match(/^(?:my|our|local|state)\s+(\$\w+)\s*\=\s*new (\w[\w\:]+)\s*(?:\((?!.*\)\->)|;)/))) {
        let varName = match[1];
        let objName = match[2];
        MakeElem(varName, PerlSymbolKind.LocalVar, objName, state);

        state.var_continues = false; // We skipped ahead of the line here. Why though?
        return true;
    } else {
        return false;
    }
}

function localVars (state: ParserState): boolean {
    
    // This is a variable declaration if one was started on the previous
    // line, or if this line starts with my or local
    let match;
    if (state.var_continues || (match = state.stmt.match(/^(?:my|our|local|state)\b/))) {
        // The declaration continues if the line does not end with ;
        state.var_continues = (!state.stmt.endsWith(";") && !state.stmt.match(/[\)\=\}\{]/));
        let mod_stmt = state.stmt;
        // Remove my or local from statement, if present
        mod_stmt = mod_stmt.replace(/^(my|our|local|state)\s+/, "");

        // Remove any assignment piece
        mod_stmt = mod_stmt.replace(/\s*=.*/, "");

        // Remove part where sub starts (for signatures). Consider other options here.
        mod_stmt = mod_stmt.replace(/\s*\}.*/, "");

        // Now find all variable names, i.e. "words" preceded by $, @ or %
        let vars = mod_stmt.matchAll(/([\$\@\%][\w:]+)\b/g);

        for (let match of vars) {
            MakeElem(match[1], PerlSymbolKind.LocalVar, '', state);
        }
        return true;
    } 
    
    // Lexical loop variables, potentially with labels in front. foreach my $foo
    else if ((match = state.stmt.match(/^(?:(\w+)\s*:(?!\:))?\s*(?:for|foreach)\s+my\s+(\$[\w]+)\b/))) {
        if (match[1]) {
            MakeElem(match[1], PerlSymbolKind.Label, '', state);
        }
        MakeElem(match[2], PerlSymbolKind.LocalVar, '', state);
    }
    // Lexical match variables if(my ($foo, $bar) ~= ). Optional to detect (my $newstring = $oldstring) =~ s/foo/bar/g;
    else if ((match = state.stmt.match(/^(?:\}\s*elsif|if|unless|while|until|for)?\s*\(\s*my\b(.*)$/))) {
        // Remove any assignment piece
        const mod_stmt = state.stmt.replace(/\s*=.*/, "");
        let vars = mod_stmt.matchAll(/([\$\@\%][\w]+)\b/g);
        for (let match of vars) {
            MakeElem(match[1], PerlSymbolKind.LocalVar, '', state);
        }
    }

    // Try-catch exception variables
    else if ((match = state.stmt.match(/^\}?\s*catch\s*\(\s*(\$\w+)\s*\)\s*\{?$/))) {
        MakeElem(match[1], PerlSymbolKind.LocalVar, '', state);
    }

    else {
        return false;
    }

    return true;
}

function packages(state: ParserState) : boolean{
    // This is a package declaration if the line starts with package
    let match;

    if ((match = state.stmt.match(/^package\s+([\w:]+)/))) {
        // Get name of the package
        state.package_name = match[1];
        const endLine = PackageEndLine(state);
        MakeElem(state.package_name, PerlSymbolKind.Package, '', state, endLine);
    } 
    
    // This is a class decoration for Object::Pad, Corinna, or Moops 
    else if((match = state.stmt.match(/^class\s+([\w:]+)/))){
        let class_name = match[1];
        state.package_name = class_name;
        const endLine = PackageEndLine(state);
        MakeElem(class_name, PerlSymbolKind.Class, '', state, endLine);
    }
    
    else if((match = state.stmt.match(/^role\s+([\w:]+)/))){
        const roleName = match[1];
        // state.package_name = roleName; # Being cautious against changing the package name
        const endLine = SubEndLine(state);
        MakeElem(roleName, PerlSymbolKind.Role, '', state, endLine);
    }

    else {
        return false;
    }

    return true;
}

function subs(state: ParserState) : boolean {

    let match;
    // This is a sub declaration if the line starts with sub
    if ((match = state.stmt.match(/^(?:async\s+)?(sub)\s+([\w:]+)(\s+:method)?([^{]*)/)) ||
            (match = state.stmt.match(/^(?:async\s+)?(method)\s+\$?([\w:]+)()([^{]*)/)) ||
            (state.perlDoc.imported.has("Function::Parameters") && (match = state.stmt.match(/^(fun)\s+([\w:]+)()([^{]*)/ )))
            ) {
        const subName = match[2];
        const signature = match[4];
        const kind = (match[1] === 'method' || match[3]) ? PerlSymbolKind.LocalMethod : PerlSymbolKind.LocalSub;
        const endLine = SubEndLine(state);

        MakeElem(subName, kind, '', state, endLine);
        // Match the after the sub declaration and before the start of the actual sub for signatures (if any)
        const vars = signature.matchAll(/([\$\@\%][\w:]+)\b/g);

        // Define subrountine signatures, but exclude prototypes
        // The declaration continues if the line does not end with ;
        state.var_continues = !(state.stmt.match(/;$/) || state.stmt.match(/[\)\=\}\{]/));

        for (const matchvar of vars) {
            MakeElem(matchvar[1], PerlSymbolKind.LocalVar,'', state);
        }
    } else {
        return false;
    }
    return true;
}

function labels(state: ParserState) : boolean {

    let match;
    // Phaser block
    if ((match = state.stmt.match(/^(BEGIN|INIT|CHECK|UNITCHECK|END|ADJUST)\s*\{/))) {
        const phaser = match[1];
        const endLine = SubEndLine(state);

        MakeElem(phaser, PerlSymbolKind.Phaser, '', state, endLine);
    }

    // Label line
    else if ((match = state.stmt.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:[^:].*{\s*$/))) {
        const label = match[1];
        const endLine = SubEndLine(state);

        MakeElem(label, PerlSymbolKind.Label, '', state, endLine);
    }

    else {
        return false;
    }

    return true;
}

function constants(state: ParserState) : boolean {

    let match;
    // Constants. Important because they look like subs (and technically are), so I'll tags them as such 
    if ((match = state.stmt.match(/^use\s+constant\s+(\w+)\b/))) {
        MakeElem(match[1], PerlSymbolKind.Constant, '', state);
        MakeElem("constant", 'u', '', state);
        return true;
    } else {
        return false;
    }
}

function fields(state: ParserState) : boolean {

    let match;
    // Moo/Moose/Object::Pad/Moops/Corinna attributes
    if ((match = state.stmt.match(/^(?:has|field)(?:\s+|\()["']?\+?([\$@%]?\w+)\b/))) {
        const attr = match[1];
        let type;
        if(attr.match(/^\w/)){
            type = PerlSymbolKind.Field;
            // If you have a locally defined package/class Foo want to reference the attributes as Foo::attr or foo->attr, you need the full path.
            // Subs don't need this since we find them at compile time. We also find "d" types from imported packages in Inquisitor.pm
            MakeElem(state.package_name + "::" + attr, PerlSymbolKind.PathedField, '', state);
        } else {
            type = PerlSymbolKind.LocalVar;
        } 
        // TODO: Define new type. Class variables should probably be shown in the Outline view even though lexical variables are not
        MakeElem(attr, type, '', state);
    }

    // Is this captured above?
    // else if (state.perlDoc.imported.has("Object::Pad") &&
    //         (match = stmt.match(/^field\s+([\$@%]\w+)\b/))) { //  Object::Pad field
    //     const attr = match[1];
    //     MakeElem(attr, PerlSymbolKind.LocalVar, '', file, package_name, line_num, perlDoc);
    // }

    else if ((state.perlDoc.imported.has("Mars::Class") || state.perlDoc.imported.has("Venus::Class"))
            && (match = state.stmt.match(/^attr\s+["'](\w+)\b/))) { // Mars attributes
        const attr = match[1];
        MakeElem(attr, PerlSymbolKind.Field, '', state);
        MakeElem(state.package_name + "::" + attr, PerlSymbolKind.PathedField, '', state);
    }

    else if ((match = state.stmt.match(/^around\s+["']?(\w+)\b/))) { // Moo/Moose overriding subs. 
        MakeElem(match[1], PerlSymbolKind.LocalSub, '', state);
    } 

    else {
        return false;
    }
    return true;
}

function imports(state: ParserState) : boolean {

    let match;
    if ((match = state.stmt.match(/^use\s+([\w:]+)\b/))) { // Keep track of explicit imports for filtering
        const importPkg = match[1];
        MakeElem(importPkg, "u", '', state);
        return true;
    } else {
        return false;
    }
}

function autoloads(state: ParserState) : boolean {
    let match;
    if ((match = state.stmt.match(/^\$self\->\{\s*(['"]|)_(\w+)\1\s*\}\s*=/))) { // Common paradigm is for autoloaders to basically just point to the class variable
        const variable = match[2];
        MakeElem("get_" + variable, PerlSymbolKind.AutoLoadVar, '', state);
        return true;
    } else {
        return false;
    }
}


function dancer(state: ParserState): boolean {
    if(!(state.perlDoc.imported.has("Dancer") || state.perlDoc.imported.has("Dancer2") || state.perlDoc.imported.has("Mojolicious::Lite"))) {
        return false;
    }

    //const rFilter = /qr\{[^\}]+\}/ ;
    let match;
    if( (match = state.stmt.match(/^(?:any|before\_route)\s+\[([^\]]+)\]\s+(?:=>\s*)?(['"])([^"']+)\2\s*=>\s*sub/))) {
        // Multiple request routing paths
        let requests = match[1];
        let route = match[3];
        // TODO: Put this back
        requests = requests.replace(/['"\s\n]+/g, "");
        route = `${requests} ${route}`;
        const endLine = SubEndLine(state);
        MakeElem(route, PerlSymbolKind.HttpRoute, '', state, endLine);

        // TODO: I think this is a bug with [^\2] not working
                                                                                                     // any ['get', 'post'] => '/login' => sub {

    } else if ((match = state.stmt.match(/^(get|any|post|put|patch|delete|del|options|ajax|before_route)\s+(?:[\s\w,\[\]'"]+=>\s*)?(['"])([^'"]+)\2\s*=>\s*sub/))) {
        // Routing paths
        let route = match[1] + " " + match[3];
        const endLine = SubEndLine(state);
        MakeElem(route, PerlSymbolKind.HttpRoute, '', state, endLine);
    } else if ((match = state.stmt.match(/^(get|any|post|put|patch|delete|del|options|ajax|before_route)\s+(qr\{[^\}]+\})\s+\s*=>\s*sub/))) {
        //  Regexp routing paths
        let route = match[1] + " " + match[2];
        const endLine = SubEndLine(state);
        MakeElem(route, PerlSymbolKind.HttpRoute, '', state, endLine);
    } else if ((match = state.stmt.match(/^(?:hook)\s+(['"]|)(\w+)\1\s*=>\s*sub/))) {
        // Hooks
        let hook = match[2];
        const endLine = SubEndLine(state);
        MakeElem(hook, PerlSymbolKind.HttpRoute, '', state, endLine);
    } else {
        return false;
    }
    return true; //  Must've matched
}


async function cleanCode(textDocument: TextDocument, perlDoc: PerlDocument, parseType: ParseType): Promise<string[]> {
    let code = textDocument.getText();

    const codeArray = code.split("\n");
    // const offset = textDocument.offsetAt(textDocument.positionAt(0));
    let codeClean = [];


    let commentState: ParserState = {
        stmt: '',
        line_number: 0,
        package_name: '',
        perlDoc: perlDoc,
        file: textDocument.uri,
        var_continues: false,
        codeArray: codeArray,
        parseType: parseType
    };

    for (commentState.line_number=0; commentState.line_number<codeArray.length;commentState.line_number++){
        commentState.stmt = codeArray[commentState.line_number];

        let match;
        if (parseType == ParseType.selfNavigation && (match = commentState.stmt.match(/#.*(\$\w+) isa ([\w:]+)\b/))){
           const pvar = match[1];
           const typeName = match[2];
           // TODO: Do I need a file or package here? Canonical variables are weird
           MakeElem(pvar, PerlSymbolKind.Canonical, typeName, commentState);
        }
        
        let mod_stmt = commentState.stmt;
        mod_stmt = mod_stmt.replace(/^\s*/, "");
        mod_stmt = mod_stmt.replace(/\s*$/, "");

        codeClean.push(mod_stmt);
    }

    // if(parseType == ParseType.outline){
    //     // If only doing shallow parsing, we don't need to strip {} or find start-end points of subs
    //     codeClean = await stripCommentsAndQuotes(codeClean);
    // }

    return codeClean;
}

 



function MakeElem(name: string, type: PerlSymbolKind | 'u' | '2',
    typeDetail: string, state: ParserState, lineEnd: number = 0): void {

    if(!name) return; // Don't store empty names (shouldn't happen)

    if(lineEnd == 0){
        lineEnd = state.line_number
    }

    if (type == 'u'){
        // Explictly loaded module. Helpful for focusing autocomplete results
        state.perlDoc.imported.set(name, state.line_number);
        // if(/\bDBI$/.exec(name)) perlDoc.imported.set(name + "::db", true); // TODO: Build mapping of common constructors to types
        return; // Don't store it as an element
    } 

    if (type == '2'){
        state.perlDoc.parents.set(name, typeDetail);
        return; // Don't store it as an element
    } 
    
    const newElem: PerlElem = {
        name: name,
        type: type,
        typeDetail: typeDetail,
        file: state.file,
        package: state.package_name,
        line: state.line_number,
        lineEnd: lineEnd,
        value: "",
    };

    if (type == '3'){
        state.perlDoc.autoloads.set(name, newElem);
        return; // Don't store it as an element
    } 


    if(typeDetail.length > 0){
        // TODO: The canonicalElems don't need to be PerlElems, they might be just a string.
        // We overwrite, so the last typed element is the canonical one. No reason for this.
        state.perlDoc.canonicalElems.set(name, newElem);
        if (type == '1'){
            // This object is only intended as the canonicalLookup, not for anything else.    
            return;
        } 
    }

    let array = state.perlDoc.elems.get(name) || [];
    array.push(newElem)
    state.perlDoc.elems.set(name, array);

    return;
}


function SubEndLine (state: ParserState, rFilter: RegExp | null = null) : number {
 
    let pos = 0;
    let found = false;
    if(state.parseType != ParseType.outline){
        return state.line_number;
    }

    for (let i = state.line_number; i < state.codeArray.length; i++) {
        // Perhaps limit the max depth?
        let stmt = state.codeArray[i];

        
        if(i == state.line_number){
            if(rFilter){
                stmt.replace(rFilter, "");
            }
            // Default argument of empty hash. Other types of hashes may still trip this up
            stmt.replace(/\$\w+\s*=\s*\{\s*\}/,"");
        }

        stmt.split('').forEach((char: string) =>  {
            if(char == '{'){
                // You may just be finding default function args = {}
                found = true; 
                pos++;
            } else if(char == '}') {
                pos--;
            }
        });
        //  Checking outside the statement is faster, but less accurate
        if(found && pos == 0){
            return i;
        }
    }
    return state.line_number;
}


function PackageEndLine (state: ParserState)  {
  
    if(state.parseType != ParseType.outline){
        return state.line_number;
    }

    let start_line = state.line_number;
    if (state.codeArray[start_line].match(/(class|package)[^#]+;/)){

        // Single line package definition.
        if (state.codeArray[start_line].match(/{.*(class|package)/)){
            // Will need to hunt for the end
        }else if (start_line > 0 && state.codeArray[start_line-1].match(/\{[^}]*$/)){
            start_line -= 1;
        }
    }

    let pos = 0;
    let found = false;

    for (let i = start_line; i < state.codeArray.length; i++) {
        // Perhaps limit the max depth?
        let stmt = state.codeArray[i];
        stmt.split('').forEach((char: string) =>  {
            if(char == '{') {
                found = true; 
                pos++;
            } else if(char == '}') {
                pos--;
            }
        });

        if(found == false){
            // If we haven't found the start of the package block, there probably isn't one. 
            if(stmt.match(/;/) || (i - start_line > 1)){
                break;
            }
        }

        //  Checking outside the forEach statement is faster, but less accurate
        if(found && pos == 0){
            return i;
        }
    }

    for (let i = start_line+1; i < state.codeArray.length; i++) {
        // TODO: update with class inheritance / version numbers, etc
        // Although should we do with nested packages/classes? (e.g. Pack A -> Pack B {} -> A)
        if(state.codeArray[i].match(/^\s*(class|package)\s+([\w:]+)/)){
            return i-1;
        }
    }

    // If we didn't find an end, run until end of file
    return state.codeArray.length;
}

// Leaving some code here, although it doesn't work. 
// Need to figure out how to load oniguruma with webassembly, plus the perl grammars

// Taken from https://github.com/bolinfest/monaco-tm/blob/908f1ca0cab3e82823cb465108ae86ee2b4ba3fc/src/app.ts#L133C1-L145C2 
// async function loadVSCodeOnigurumWASM(): Promise<Response | ArrayBuffer> {
//     const response = await fetch('/node_modules/vscode-oniguruma/release/onig.wasm');
//     const contentType = response.headers.get('content-type');
//     if (contentType === 'application/wasm') {
//       return response;
//     }
  
//     // Using the response directly only works if the server sets the MIME type 'application/wasm'.
//     // Otherwise, a TypeError is thrown when using the streaming compiler.
//     // We therefore use the non-streaming compiler :(.
//     return await response.arrayBuffer();
//   }


// const vscodeOnigurumaLib = loadVSCodeOnigurumWASM().then((wasmBin: Response | ArrayBuffer) => {
//     return oniguruma.loadWASM(wasmBin);
//     })
//     .then(() => {
//         return {
//             createOnigScanner(patterns: any) { return new oniguruma.OnigScanner(patterns); },
//             createOnigString(s: any) { return new oniguruma.OnigString(s); }
//         };
//     });

// const registry = new vsctm.Registry({
//     onigLib: vscodeOnigurumaLib,
//     loadGrammar: async (scopeName) => {
//         const grammarResponse= await fetch('https://raw.githubusercontent.com/bscan/PerlNavigator/main/server/perl.tmLanguage.json'); 
//         const grammar = await grammarResponse.text();
//         return vsctm.parseRawGrammar(grammar);
//     }
// });



