
import { PerlDocument, PerlElem, PerlImport, PerlSymbolKind} from "./types";


export async function buildNav(stdout: string, filePath: string, fileuri: string): Promise<PerlDocument> {

    stdout = stdout.replace(/\r/g, ""); // Windows 

    let perlDoc: PerlDocument = {
            elems: new Map(),
            canonicalElems: new Map(),
            autoloads: new Map(),
            imported: new Map(),
            parents: new Map(),
            filePath: filePath,
            uri: fileuri,
        };

    stdout.split("\n").forEach(perl_elem => {
        parseElem(perl_elem, perlDoc);
    });
    
    return perlDoc;
}


function parseElem(perlTag: string, perlDoc: PerlDocument): void {

    var items = perlTag.split('\t');

    if(items.length != 7){
        return;
    }
    if (!items[0] || items[0]=='_') return; // Need a look-up key

    const name       = items[0];
    const type       = items[1] || ""; 
    const typeDetail = items[2] || ""; 
    const file       = items[3] || ""; 
    const pack       = items[4] || ""; 
    
    const lines      = items[5].split(';');

    const startLine  = lines[0] ? +lines[0] : 0;
    const endLine    = lines[1] ? +lines[1] : startLine;

    const value      = items[6] || ""; 

    if (type == 'u'){
        // Explictly loaded module. Helpful for focusing autocomplete results
        perlDoc.imported.set(name, startLine);
        // if(/\bDBI$/.exec(name)) perlDoc.imported.set(name + "::db", true); // TODO: Build mapping of common constructors to types
        return; // Don't store it as an element
    } 

    if (type == '2'){
        perlDoc.parents.set(name, typeDetail);
        return; // Don't store it as an element
    } 


    // Add anyway
    const newElem: PerlElem = {
        name: name,
        type: type as PerlSymbolKind,
        typeDetail: typeDetail,
        file: file,
        package: pack,
        line: startLine,
        lineEnd: endLine,
        value: value,
    };

    // Move fancy object types into the typeDetail field????
    if (type.length > 1){
        // We overwrite, so the last typed element is the canonical one. No reason for this.
        perlDoc.canonicalElems.set(name, newElem);
    } 

    if (type == '1'){
        // This object is only intended as the canonicalLookup, not for anything else.
        // This doesn't do anything until fancy object types are moved into the typeDetail field
        return;
    }

    if (type == '3'){
        perlDoc.autoloads.set(name, newElem);
        return; // Don't store it as an element
    } 

    addVal(perlDoc.elems, name, newElem);

    return;
}

function addVal (map: Map<string, any[]>, key: string, value: any) {
    let array = map.get(key) || [];
    array.push(value)
    map.set(key, array);
}