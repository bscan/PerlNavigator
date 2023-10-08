

import { start } from "repl";
import { PerlDocument, PerlElem, PerlImport, PerlSymbolKind, ParseType} from "./types";
import { TextDocument } from 'vscode-languageserver-textdocument';
import Uri from 'vscode-uri';
import fs = require('fs');
import path = require('path');
import vsctm = require('vscode-textmate');
import oniguruma = require('vscode-oniguruma');
import { nextTick } from "process";

function init_doc (textDocument: TextDocument): PerlDocument {

    // We probably dont need this
    const filePath = Uri.parse(textDocument.uri).fsPath;


    let perlDoc: PerlDocument = {
        elems: new Map(),
        canonicalElems: new Map(),
        autoloads: new Map(),
        imported: new Map(),
        parents: new Map(),
        filePath: filePath,
        uri: textDocument.uri,
    };

    return perlDoc;
}

export async function parseDocument(textDocument: TextDocument, parseType: ParseType ): Promise<PerlDocument> {

    let perlDoc = init_doc(textDocument);

    const codeArray = await cleanCode(textDocument, perlDoc, parseType);
    let sActiveOO: Map<string, boolean> = new Map(); // Keep track of OO frameworks in use to keep down false alarms on field vs has vs attr
    // Loop through file
    const file = Uri.parse(textDocument.uri).fsPath;
    let package_name  = "";
    let var_continues: boolean = false;

    for (let line_num = 0; line_num < codeArray.length; line_num++) {
        let stmt = codeArray[line_num];
        // Nothing left? Never mind.
        if (!stmt) {
            continue;
        }
           
        // TODO, allow specifying list of constructor names as config
        // Declaring an object. Let's store the type
        let match;
        // my $constructors = qr/(?:new|connect)/;

        if ((match = stmt.match(/^(?:my|our|local|state)\s+(\$\w+)\s*\=\s*([\w\:]+)\-\>new\s*(?:\((?!.*\)\->)|;)/ )) ||
            (match = stmt.match(/^(?:my|our|local|state)\s+(\$\w+)\s*\=\s*new (\w[\w\:]+)\s*(?:\((?!.*\)\->)|;)/))) {
            let varName = match[1];
            let objName = match[2];
            MakeElem(varName, PerlSymbolKind.LocalVar, objName, file, package_name, line_num, perlDoc);

            var_continues = false; // We skipped ahead of the line here.
        }
        // This is a variable declaration if one was started on the previous
        // line, or if this line starts with my or local
        else if (var_continues || (match = stmt.match(/^(?:my|our|local|state)\b/))) {
            // The declaration continues if the line does not end with ;
            var_continues = (!stmt.endsWith(";") && !stmt.match(/[\)\=\}\{]/));
    
            // Remove my or local from statement, if present
            stmt = stmt.replace(/^(my|our|local|state)\s+/, "");
    
            // Remove any assignment piece
            stmt = stmt.replace(/\s*=.*/, "");
    
            // Remove part where sub starts (for signatures). Consider other options here.
            stmt = stmt.replace(/\s*\}.*/, "");
    
            // Now find all variable names, i.e. "words" preceded by $, @ or %
            let vars = stmt.matchAll(/([\$\@\%][\w:]+)\b/g);
    
            for (let match of vars) {
                MakeElem(match[1], PerlSymbolKind.LocalVar, '', file, package_name, line_num, perlDoc);
            }
        }
    
        // Lexical loop variables, potentially with labels in front. foreach my $foo
        else if ((match = stmt.match(/^(?:(\w+)\s*:(?!\:))?\s*(?:for|foreach)\s+my\s+(\$[\w]+)\b/))) {
            if (match[1]) {
                MakeElem(match[1], PerlSymbolKind.Label, '', file, package_name, line_num, perlDoc);
            }
            MakeElem(match[2], PerlSymbolKind.LocalVar, '', file, package_name, line_num, perlDoc);
        }

        // Lexical match variables if(my ($foo, $bar) ~= ). Optional to detect (my $newstring = $oldstring) =~ s/foo/bar/g;
        else if ((match = stmt.match(/^(?:\}\s*elsif|if|unless|while|until|for)?\s*\(\s*my\b(.*)$/))) {
            // Remove any assignment piece
            stmt = stmt.replace(/\s*=.*/, "");
            let vars = stmt.matchAll(/([\$\@\%][\w]+)\b/g);
            for (let match of vars) {
                MakeElem(match[1], PerlSymbolKind.LocalVar, '', file, package_name, line_num, perlDoc);
            }
        }

        // Try-catch exception variables
        else if ((match = stmt.match(/^\}?\s*catch\s*\(\s*(\$\w+)\s*\)\s*\{?$/))) {
            MakeElem(match[1], PerlSymbolKind.LocalVar, '', file, package_name, line_num, perlDoc);
        }

        // This is a package declaration if the line starts with package
        else if ((match = stmt.match(/^package\s+([\w:]+)/))) {
            // Get name of the package
            package_name = match[1];
            const endLine = PackageEndLine(line_num, codeArray, parseType);
            MakeElem(package_name, PerlSymbolKind.Package, '', file, package_name, line_num, perlDoc, endLine);
        }

         // This is a class decoration for Object::Pad, Corinna, or Moops 
        else if((match = stmt.match(/^class\s+([\w:]+)/))){
            let class_name = match[1];
            const endLine = PackageEndLine(line_num, codeArray, parseType);
            MakeElem(class_name, PerlSymbolKind.Class, '', file, package_name, line_num, perlDoc, endLine);
        }

        else if((match = stmt.match(/^role\s+([\w:]+)/))){
            const roleName = match[1];
            const endLine = SubEndLine(line_num, codeArray, parseType);
            MakeElem(roleName, PerlSymbolKind.Role, '', file, package_name, line_num, perlDoc, endLine);
        }

        // This is a sub declaration if the line starts with sub
        else if ((match = stmt.match(/^(?:async\s+)?(sub)\s+([\w:]+)(\s+:method)?([^{]*)/)) ||
                (match = stmt.match(/^(?:async\s+)?(method)\s+\$?([\w:]+)()([^{]*)/)) ||
                (sActiveOO.get("Function::Parameters") && (match = stmt.match(/^(fun)\s+([\w:]+)()([^{]*)/ )))
                ) {
            const subName = match[2];
            const signature = match[4];
            const kind = (match[1] === 'method' || match[3]) ? PerlSymbolKind.LocalMethod : PerlSymbolKind.LocalSub;
            const endLine = SubEndLine(line_num, codeArray, parseType);

            MakeElem(subName, kind, '', file, package_name, line_num, perlDoc, endLine);
            // Match the after the sub declaration and before the start of the actual sub for signatures (if any)
            const vars = signature.matchAll(/([\$\@\%][\w:]+)\b/g);

            // Define subrountine signatures, but exclude prototypes
            // The declaration continues if the line does not end with ;
            var_continues = !(stmt.match(/;$/) || stmt.match(/[\)\=\}\{]/));

            for (const matchvar of vars) {
                MakeElem(matchvar[1], PerlSymbolKind.LocalVar,'', file, package_name, line_num, perlDoc);
            }
        }

        // Phaser block
        else if ((match = stmt.match(/^(BEGIN|INIT|CHECK|UNITCHECK|END)\s*\{/))) {
            const phaser = match[1];
            const endLine = SubEndLine(line_num, codeArray, parseType);

            MakeElem(phaser, PerlSymbolKind.Phaser, '', file, package_name, line_num, perlDoc, endLine);
        }

        // Label line
        else if ((match = stmt.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:[^:].*{\s*$/))) {
            const label = match[1];
            const endLine = SubEndLine(line_num, codeArray, parseType);

            MakeElem(label, PerlSymbolKind.Label, '', file, package_name, line_num, perlDoc, endLine);
        }

        // Constants. Important because they look like subs (and technically are), so I'll tags them as such 
        else if ((match = stmt.match(/^use\s+constant\s+(\w+)\b/))) {
            MakeElem(match[1], PerlSymbolKind.Constant, '', file, package_name, line_num, perlDoc);
            MakeElem("constant", 'u', '', file, package_name, line_num, perlDoc);
        }

        // Moo/Moose/Object::Pad/Moops/Corinna attributes
        else if ((match = stmt.match(/^(?:has|field)(?:\s+|\()["']?([\$@%]?\w+)\b/))) { 
            const attr = match[1];
            let type;
            if(attr.match(/^\w/)){
                type = PerlSymbolKind.Field;
                // If you have a locally defined package/class Foo want to reference the attributes as Foo::attr or foo->attr, you need the full path.
                // Subs don't need this since we find them at compile time. We also find "d" types from imported packages in Inquisitor.pm
                MakeElem(package_name + "::" + attr, PerlSymbolKind.PathedField, '', file, package_name, line_num, perlDoc);
            } else {
                type = PerlSymbolKind.LocalVar;
            } 
            // TODO: Define new type. Class variables should probably be shown in the Outline view even though lexical variables are not
            MakeElem(attr, type, '', file, package_name, line_num, perlDoc);
        }

        // Is this capture above?
        // else if (sActiveOO.get("Object::Pad") &&
        //         (match = stmt.match(/^field\s+([\$@%]\w+)\b/))) { //  Object::Pad field
        //     const attr = match[1];
        //     MakeElem(attr, PerlSymbolKind.LocalVar, '', file, package_name, line_num, perlDoc);
        // }

        else if ((sActiveOO.get("Mars::Class") || sActiveOO.get("Venus::Class"))
                && (match = stmt.match(/^attr\s+["'](\w+)\b/))) { // Mars attributes
            const attr = match[1];
            MakeElem(attr, PerlSymbolKind.Field, '', file, package_name, line_num, perlDoc);
            MakeElem(package_name + "::" + attr, PerlSymbolKind.PathedField, '', file, package_name, line_num, perlDoc);
        }

        else if ((match = stmt.match(/^around\s+["']?(\w+)\b/))) { // Moo/Moose overriding subs. 
            MakeElem(match[1], PerlSymbolKind.LocalSub, '', file, package_name, line_num, perlDoc);
        } 
        
        else if ((match = stmt.match(/^use\s+([\w:]+)\b/))) { // Keep track of explicit imports for filtering
            const importPkg = match[1];
            MakeElem(importPkg, "u", '', file, package_name, line_num, perlDoc);
            sActiveOO.set(importPkg, true);
        }

        else if(MatchDancer(stmt, line_num, sActiveOO, file, package_name, perlDoc, codeArray, parseType)) {
            // Self contained
        }

        else if ((match = stmt.match(/^\$self\->\{\s*(['"]|)_(\w+)\1\s*\}\s*=/))) { // Common paradigm is for autoloaders to basically just point to the class variable
            const variable = match[2];
            MakeElem("get_" + variable, PerlSymbolKind.AutoLoadVar, '', file, package_name, line_num, perlDoc);
        }

    }
    return perlDoc;    
}


function MatchDancer(stmt: string, line_num: number, sActiveOO: Map<string, boolean>,
                    file: string, package_name: string, perlDoc: PerlDocument, codeArray: string[], parseType: ParseType): boolean {

        
    if(!(sActiveOO.has("Dancer") || sActiveOO.has("Dancer2") || sActiveOO.has("Mojolicious::Lite"))) {
        return false;
    }

    //const rFilter = /qr\{[^\}]+\}/ ;
    let match;
    if( (match = stmt.match(/^(?:any|before\_route)\s+\[([^\]]+)\]\s+(?:=>\s*)?(['"])([^"']+)\2\s*=>\s*sub/))) {
        // Multiple request routing paths
        let requests = match[1];
        let route = match[3];
        // TODO: Put this back
        requests = requests.replace(/['"\s\n]+/g, "");
        route = `${requests} ${route}`;
        const endLine = SubEndLine(line_num, codeArray, parseType);
        MakeElem(route, PerlSymbolKind.HttpRoute, '', file, package_name, line_num, perlDoc, endLine);

        // TODO: I think this is a bug with [^\2] not working
                                                                                                     // any ['get', 'post'] => '/login' => sub {

    } else if ((match = stmt.match(/^(get|any|post|put|patch|delete|del|options|ajax|before_route)\s+(?:[\s\w,\[\]'"]+=>\s*)?(['"])([^'"]+)\2\s*=>\s*sub/))) {
        // Routing paths
        let route = match[1] + " " + match[3];
        const endLine = SubEndLine(line_num, codeArray, parseType);
        MakeElem(route, PerlSymbolKind.HttpRoute, '', file, package_name, line_num, perlDoc, endLine);
    } else if ((match = stmt.match(/^(get|any|post|put|patch|delete|del|options|ajax|before_route)\s+(qr\{[^\}]+\})\s+\s*=>\s*sub/))) {
        //  Regexp routing paths
        let route = match[1] + " " + match[2];
        const endLine = SubEndLine(line_num, codeArray, parseType);
        MakeElem(route, PerlSymbolKind.HttpRoute, '', file, package_name, line_num, perlDoc, endLine);
    } else if ((match = stmt.match(/^(?:hook)\s+(['"]|)(\w+)\1\s*=>\s*sub/))) {
        // Hooks
        let hook = match[2];
        const endLine = SubEndLine(line_num, codeArray, parseType);
        MakeElem(hook, PerlSymbolKind.HttpRoute, '', file, package_name, line_num, perlDoc, endLine);
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

    for (let i=0; i<codeArray.length;i++){
        let stmt = codeArray[i];

        let match;
        if ((match = stmt.match(/#.*(\$\w+) isa ([\w:]+)\b/))){
           const pvar = match[1];
           const typeName = match[2];
           // TODO: Do I need a file or package here? Canonical variables are weird
            MakeElem(pvar, PerlSymbolKind.Canonical, typeName, "", "", i, perlDoc);
        }
        
        stmt = stmt.replace(/^\s*/, "");
        stmt = stmt.replace(/\s*$/, "");

        codeClean.push(stmt);
    }

    if(parseType == ParseType.deep){
        // If only doing shallow parsing, we don't need to strip {} or find start-end points of subs
        codeClean = await stripCommentsAndQuotes(codeClean);
    }

    return codeClean;
}

 



function MakeElem(name: string, type: PerlSymbolKind | 'u' | '2',
    typeDetail: string, file: string, pack: string, line: number, perlDoc: PerlDocument,
    lineEnd: number = 0): void {

    if(!name) return; // Don't store empty names (shouldn't happen)

    if(lineEnd == 0){
        lineEnd = line;
    }

    if (type == 'u'){
        // Explictly loaded module. Helpful for focusing autocomplete results
        perlDoc.imported.set(name, line);
        // if(/\bDBI$/.exec(name)) perlDoc.imported.set(name + "::db", true); // TODO: Build mapping of common constructors to types
        return; // Don't store it as an element
    } 

    if (type == '2'){
        perlDoc.parents.set(name, typeDetail);
        return; // Don't store it as an element
    } 
    
    const newElem: PerlElem = {
        name: name,
        type: type,
        typeDetail: typeDetail,
        file: file,
        package: pack,
        line: line,
        lineEnd: lineEnd,
        value: "",
    };

    if (type == '3'){
        perlDoc.autoloads.set(name, newElem);
        return; // Don't store it as an element
    } 


    if(typeDetail.length > 0){
        // TODO: The canonicalElems don't need to be PerlElems, they might be just a string.
        // We overwrite, so the last typed element is the canonical one. No reason for this.
        perlDoc.canonicalElems.set(name, newElem);
        if (type == '1'){
            // This object is only intended as the canonicalLookup, not for anything else.    
            return;
        } 
    }

    let array = perlDoc.elems.get(name) || [];
    array.push(newElem)
    perlDoc.elems.set(name, array);

    return;
}



function SubEndLine (start_line: number, code: String[], parseType: ParseType, rFilter: RegExp | null = null) : number {
 
    let pos = 0;
    let found = false;
    if(parseType == ParseType.shallow) return start_line;

    for (let i = start_line; i < code.length; i++) {
        // Perhaps limit the max depth?
        let stmt = code[i];

        
        if(i == start_line){
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
    return start_line;
}


function PackageEndLine (start_line: number, code: String[], parseType: ParseType)  {
  
    if(parseType == ParseType.shallow) return start_line;

    if (code[start_line].match(/(class|package)[^#]+;/)){

        // Single line package definition.
        if (code[start_line].match(/{.*(class|package)/)){
            // Will need to hunt for the end
        }else if (start_line > 0 && code[start_line-1].match(/\{[^}]*$/)){
            start_line -= 1;
        }
    }

    let pos = 0;
    let found = false;

    for (let i = start_line; i < code.length; i++) {
        // Perhaps limit the max depth?
        let stmt = code[i];
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

    for (let i = start_line+1; i < code.length; i++) {
        // TODO: update with class inheritance / version numbers, etc
        // Although should we do with nested packages/classes? (e.g. Pack A -> Pack B {} -> A)
        if(code[i].match(/^\s*(class|package)\s+([\w:]+)/)){
            return i-1;
        }
    }

    // If we didn't find an end, run until end of file
    return code.length;
}


const wasmBin = fs.readFileSync(path.join(__dirname, './../node_modules/vscode-oniguruma/release/onig.wasm')).buffer;
const vscodeOnigurumaLib = oniguruma.loadWASM(wasmBin).then(() => {
    return {
        createOnigScanner(patterns: any) { return new oniguruma.OnigScanner(patterns); },
        createOnigString(s: any) { return new oniguruma.OnigString(s); }
    };
});

const registry = new vsctm.Registry({
    onigLib: vscodeOnigurumaLib,
    loadGrammar: async (scopeName) => {
        const grammarpath = path.join(__dirname,'./../perl.tmLanguage.json'); 
        const grammar = await fs.promises.readFile(grammarpath, 'utf8');
        return vsctm.parseRawGrammar(grammar, grammarpath);
    }
});


async function stripCommentsAndQuotes(code: string[]): Promise<string[]> {
    const grammar = await registry.loadGrammar('source.perl'); 
    if (!grammar) {
        throw new Error("Couldn't load Textmate grammar");
    }

    let ruleStack: vsctm.StateStack | null = vsctm.INITIAL;
    let codeStripped = [];
    
    for (const line of code) {
        const result = grammar.tokenizeLine(line, ruleStack);
        ruleStack = result.ruleStack;
        let strippedCode = '';

        let lastEndIndex = 0;
        for (const token of result.tokens) {
            const content = line.substring(lastEndIndex, token.endIndex);
            lastEndIndex = token.endIndex;

            // This includes regexes and pod too
            const isComment = token.scopes.some(scope => scope.startsWith('comment') );

            if(isComment){
                // Remove all comments
                continue;
            }
            
            const isString = token.scopes.some(scope => scope.startsWith('string') );
            const isPunc = token.scopes.some(scope => scope.startsWith('punctuation') );

            if(isString && !isPunc){
                if(strippedCode == ''){
                    // The 2nd-Nth lines of multi-line strings should be stripped
                    strippedCode += "___";
                    continue;
                }else if(content.match(/[\{\}]/)) {
                    // In-line strings that contains {} need to be stripped regardless of position
                    continue;
                }
            }
            strippedCode += content;
        }
        codeStripped.push(strippedCode);
    }

    return codeStripped;
}



// import Parser = require('tree-sitter');
// import { SyntaxNode } from 'tree-sitter';
// const Perl = require('./../tree-sitter-perl');


// export function tagSource () {
//     return "Example";
// }
// // const parser = new Parser();
// // parser.setLanguage(Perl);

// const sourceCode = `
//   # This is a comment
//   my $foo = "Hello, world"; # Another comment
//   my $bar = "
//     Multiline string
//   ";
// `;

// const tree = parser.parse(sourceCode);

// // Define a function to strip comments and quotes but preserve line breaks
// function stripCommentsAndQuotes(node: SyntaxNode, code: string[]) {
//     if (node.type === 'comment') {
//         const start = node.startIndex;
//         const end = node.endIndex;
//         for (let i = start; i < end; i++) {
//             if (code[i] !== '\n') { // Preserve line breaks
//                 code[i] = ' ';
//             }
//         }
//     } else if (node.type === 'string') {
//         // TODO:  if the opening and closing quotes are actually quotes.
//         const start = node.startIndex + 1; // Start after the opening quote
//         const end = node.endIndex - 1; // Stop before the closing quote
//         for (let i = start; i < end; i++) {
//             if (code[i] !== '\n') { // Preserve line breaks
//                 code[i] = ' ';
//             }
//         }
//     }
//     for (const child of node.children) {
//         stripCommentsAndQuotes(child, code);
//     }
// }

// const codeArray = Array.from(sourceCode);
// stripCommentsAndQuotes(tree.rootNode, codeArray);
// const strippedCode = codeArray.join('');