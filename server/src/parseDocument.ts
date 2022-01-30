
import { PerlDocument, PerlElem, PerlType, PerlImport } from "./types";


export async function buildNav(stdout: string): Promise<PerlDocument> {

    stdout = stdout.replace(/\r/g, ""); // Windows 

    let perlDoc: PerlDocument = {
            elems: new Map(),
            vartypes: new Map(),
            imported: new Map(),
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
    const lineNum    = items[5] ? +items[5] : 0; 
    const value      = items[6] || ""; 


    if (type.length > 1){
        const newType: PerlType = {
            type: type,
        }
        perlDoc.vartypes.set(name, newType);
    } 

    if (type == 'u'){
        // Explictly loaded module. Helpful for focusing autocomplete results
        perlDoc.imported.set(name, true);
        // if(/\bDBI$/.exec(name)) perlDoc.imported.set(name + "::db", true); // TODO: Build mapping of common constructors to types
        return; // Don't store it as an element
    } 


    // Add anyway
    const newElem: PerlElem = {
        name: name,
        type: type,
        typeDetail: typeDetail,
        file: file,
        package: pack,
        line: lineNum,
        value: value,
    };

    addVal(perlDoc.elems, name, newElem);

    return;
}

function addVal (map: Map<string, any[]>, key: string, value: any) {
    let array = map.get(key) || [];
    array.push(value)
    map.set(key, array);
}