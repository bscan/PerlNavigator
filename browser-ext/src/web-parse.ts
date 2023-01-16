
import { PerlDocument, PerlElem, PerlImport, PerlSymbolKind} from "./web-types";
import { TextDocument } from 'vscode-languageserver-textdocument';


// Why is this async? It doesn't do anything async yet
export async function buildNav(textDocument: TextDocument): Promise<PerlDocument> {

    let perlDoc: PerlDocument = {
            elems: new Map(),
            canonicalElems: new Map(),
            imported: new Map(),
            parents: new Map(),
            filePath: '',
            uri: textDocument.uri,
        };

    buildPlTags(textDocument, perlDoc);
    
    return perlDoc;
}



function MakeElem(name: string, type: PerlSymbolKind | 'u' | '1' | '2', typeDetail: string, file: string, pack:string, line:number, perlDoc: PerlDocument) : void{

    if(!name) return; // Don't store empty names (shouldn't happen)

    if (type == '1'){
        // This object is only intended as the canonicalLookup, not for anything else.
        return;
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
        lineEnd: line,
        value: "",
    };

    // Move fancy object types into the typeDetail field????
    if (type.length > 1){
        // We overwrite, so the last typed element is the canonical one. No reason for this.
        perlDoc.canonicalElems.set(name, newElem);
    } 

    let array = perlDoc.elems.get(name) || [];
    array.push(newElem)
    perlDoc.elems.set(name, array);

    return;
}



function buildPlTags(textDocument: TextDocument, perlDoc: PerlDocument) {
    const codeArray = cleanCode(textDocument);
    let sActiveOO: Map<string, boolean> = new Map(); // Keep track of OO frameworks in use to keep down false alarms on field vs has vs attr
    // Loop through file
    const file = textDocument.uri;
    let package_name  = "";
    let var_continues: boolean = false;

    for (let i = 0; i < codeArray.length; i++) {
        let line_number = i;
        let stmt = codeArray[i];
        // Nothing left? Never mind.
        if (!stmt) {
            continue;
        }
           
        // TODO, allow specifying list of constructor names as config
        // Declaring an object. Let's store the type
        let match;
        if ((match = stmt.match(/^(?:my|our|local|state)\s+(\$\w+)\s*\=\s*([\w\:]+)\-\>new\s*(?:\((?!.*\)\->)|;)/ )) ||
            (match = stmt.match(/^(?:my|our|local|state)\s+(\$\w+)\s*\=\s*new (\w[\w\:]+)\s*(?:\((?!.*\)\->)|;)/))) {
            let varName = match[1];
            let objName = match[2];
            MakeElem(varName, PerlSymbolKind.LocalVar, objName, file, package_name, line_number, perlDoc);

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
                MakeElem(match[1], PerlSymbolKind.LocalVar, '', file, package_name, line_number, perlDoc);
            }
        }
    
        // Lexical loop variables, potentially with labels in front. foreach my $foo
        else if ((match = stmt.match(/^(?:(\w+)\s*:(?!\:))?\s*(?:for|foreach)\s+my\s+(\$[\w]+)\b/))) {
            if (match[1]) {
                MakeElem(match[1], PerlSymbolKind.Label, '', file, package_name, line_number, perlDoc);
            }
            MakeElem(match[2], PerlSymbolKind.LocalVar, '', file, package_name, line_number, perlDoc);
        }

        // Lexical match variables if(my ($foo, $bar) ~= ). Optional to detect (my $newstring = $oldstring) =~ s/foo/bar/g;
        else if ((match = stmt.match(/^(?:\}\s*elsif|if|unless|while|until|for)?\s*\(\s*my\b(.*)$/))) {
            // Remove any assignment piece
            stmt = stmt.replace(/\s*=.*/, "");
            let vars = stmt.matchAll(/([\$\@\%][\w]+)\b/g);
            for (let match of vars) {
                MakeElem(match[1], PerlSymbolKind.LocalVar, '', file, package_name, line_number, perlDoc);
            }
        }

        // This is a package declaration if the line starts with package
        else if ((match = stmt.match(/^package\s+([\w:]+)/))) {
            // Get name of the package
            package_name = match[1];
            MakeElem(package_name, PerlSymbolKind.Package, '', file, package_name, line_number, perlDoc);
        }

         // This is a class decoration for Object::Pad, Corinna, or Moops 
        else if((match = stmt.match(/^class\s+([\w:]+)/))){
            let class_name = match[1];
            MakeElem(class_name, PerlSymbolKind.Class, '', file, package_name, line_number, perlDoc);
        }

        // This is a sub declaration if the line starts with sub
        else if ((match = stmt.match(/^(?:async\s+)?(sub)\s+([\w:]+)(\s+:method)?([^{]*)/)) ||
                (match = stmt.match(/^(?:async\s+)?(method)\s+\$?([\w:]+)()([^{]*)/)) ||
                (sActiveOO.get("Function::Parameters") && (match = stmt.match(/^(fun)\s+([\w:]+)()([^{]*)/ )))
                ) {
            const subName = match[2];
            const signature = match[4];
            const kind = (match[1] === 'method' || match[3]) ? PerlSymbolKind.LocalMethod : PerlSymbolKind.LocalSub;
            MakeElem(subName, kind, '', file, package_name, line_number, perlDoc);

            // Match the after the sub declaration and before the start of the actual sub for signatures (if any)
            const vars = signature.matchAll(/([\$\@\%][\w:]+)\b/g);

            // Define subrountine signatures, but exclude prototypes
            // The declaration continues if the line does not end with ;
            var_continues = !(stmt.match(/;$/) || stmt.match(/[\)\=\}\{]/));

            for (const matchvar of vars) {
                MakeElem(matchvar[1], PerlSymbolKind.LocalVar,'', file, package_name, line_number, perlDoc);
            }
        }

        // Phaser block
        else if ((match = stmt.match(/^(BEGIN|INIT|CHECK|UNITCHECK|END)\s*\{/))) {
            const phaser = match[1];
            MakeElem(phaser, PerlSymbolKind.Phaser, '', file, package_name, line_number, perlDoc);
        }

        // Label line
        else if ((match = stmt.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:[^:].*{\s*$/))) {
            const label = match[1];
            MakeElem(label, PerlSymbolKind.Label, '', file, package_name, line_number, perlDoc);
        }

        // Constants. Important because they look like subs (and technically are), so I'll tags them as such 
        else if ((match = stmt.match(/^use\s+constant\s+(\w+)\b/))) {
            MakeElem(match[1], PerlSymbolKind.Constant, '', file, package_name, line_number, perlDoc);
            MakeElem("constant", 'u', '', file, package_name, line_number, perlDoc);
        }

        // Moo/Moose/Object::Pad/Moops/Corinna attributes
        else if ((match = stmt.match(/^has(?:\s+|\()["']?([\$@%]?\w+)\b/))) { 
            const attr = match[1];
            let type;
            if(attr.match(/^\w/)){
                type = PerlSymbolKind.Field;
                // If you have a locally defined package/class Foo want to reference the attributes as Foo::attr or foo->attr, you need the full path.
                // Subs don't need this since we find them at compile time. We also find "d" types from imported packages in Inquisitor.pm
                MakeElem(package_name + "::" + attr, PerlSymbolKind.PathedField, '', file, package_name, line_number, perlDoc);
            } else {
                type = PerlSymbolKind.LocalVar;
            } 
            // TODO: Define new type. Class variables should probably be shown in the Outline view even though lexical variables are not
            MakeElem(attr, type, '', file, package_name, line_number, perlDoc);
        }

        else if (sActiveOO.get("Object::Pad") &&
                (match = stmt.match(/^field\s+([\$@%]\w+)\b/))) { //  Object::Pad field
            const attr = match[1];
            MakeElem(attr, PerlSymbolKind.LocalVar, '', file, package_name, line_number, perlDoc);
        }

        else if ((sActiveOO.get("Mars::Class") || sActiveOO.get("Venus::Class"))
                && (match = stmt.match(/^attr\s+["'](\w+)\b/))) { // Mars attributes
            const attr = match[1];
            MakeElem(attr, PerlSymbolKind.Field, '', file, package_name, line_number, perlDoc);
            MakeElem(package_name + "::" + attr, PerlSymbolKind.PathedField, '', file, package_name, line_number, perlDoc);
        }

        else if ((match = stmt.match(/^around\s+["']?(\w+)\b/))) { // Moo/Moose overriding subs. 
            MakeElem(match[1], PerlSymbolKind.LocalSub, '', file, package_name, line_number, perlDoc);
        } 
        
        else if ((match = stmt.match(/^use\s+([\w:]+)\b/))) { // Keep track of explicit imports for filtering
            const importPkg = match[1];
            MakeElem(importPkg, "u", '', file, package_name, line_number, perlDoc);
            sActiveOO.set(importPkg, true);
        }

    }
        
}


function cleanCode(textDocument: TextDocument): String[] {
    const code = textDocument.getText();
    const codeArray = code.split("\n");
    const offset = textDocument.offsetAt(textDocument.positionAt(0));


    let line_number = -offset;

    let codeClean = [];

    for (let i=0; i<codeArray.length;i++){
        line_number++;

        let stmt = codeArray[i];

        if (stmt.match(/^(__END__|__DATA__)\s*$/)) {
            break;
        }
        
        // Statement will be line with comments, whitespace and POD trimmed
        stmt = stmt.replace(/^\s*#.*/, "");
        stmt = stmt.replace(/^\s*/, "");
        stmt = stmt.replace(/\s*$/, "");
        codeClean.push(stmt);
    }
    return codeClean;
}

