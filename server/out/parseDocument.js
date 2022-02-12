"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildNav = void 0;
async function buildNav(stdout) {
    stdout = stdout.replace(/\r/g, ""); // Windows 
    let perlDoc = {
        elems: new Map(),
        canonicalElems: new Map(),
        imported: new Map(),
    };
    stdout.split("\n").forEach(perl_elem => {
        parseElem(perl_elem, perlDoc);
    });
    return perlDoc;
}
exports.buildNav = buildNav;
function parseElem(perlTag, perlDoc) {
    var items = perlTag.split('\t');
    if (items.length != 7) {
        return;
    }
    if (!items[0] || items[0] == '_')
        return; // Need a look-up key
    const name = items[0];
    const type = items[1] || "";
    const typeDetail = items[2] || "";
    const file = items[3] || "";
    const pack = items[4] || "";
    const lineNum = items[5] ? +items[5] : 0;
    const value = items[6] || "";
    if (type == 'u') {
        // Explictly loaded module. Helpful for focusing autocomplete results
        perlDoc.imported.set(name, lineNum);
        // if(/\bDBI$/.exec(name)) perlDoc.imported.set(name + "::db", true); // TODO: Build mapping of common constructors to types
        return; // Don't store it as an element
    }
    // Add anyway
    const newElem = {
        name: name,
        type: type,
        typeDetail: typeDetail,
        file: file,
        package: pack,
        line: lineNum,
        value: value,
    };
    if (type.length > 1) {
        // We overwrite, so the last typed element is the canonical one. No reason for this.
        perlDoc.canonicalElems.set(name, newElem);
    }
    addVal(perlDoc.elems, name, newElem);
    return;
}
function addVal(map, key, value) {
    let array = map.get(key) || [];
    array.push(value);
    map.set(key, array);
}
//# sourceMappingURL=parseDocument.js.map