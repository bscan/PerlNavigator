"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHover = void 0;
const utils_1 = require("./utils");
function getHover(params, perlDoc, txtDoc) {
    let position = params.position;
    const symbol = (0, utils_1.getSymbol)(position, txtDoc);
    let elem = perlDoc.canonicalElems.get(symbol);
    if (!elem) {
        const elems = (0, utils_1.lookupSymbol)(perlDoc, symbol, position.line);
        if (elems.length != 1)
            return; // Nothing or too many things.
        elem = elems[0];
    }
    let hoverStr = buildHoverDoc(symbol, elem);
    if (!hoverStr)
        return; // Sometimes, there's nothing worth showing.
    const documentation = { contents: hoverStr };
    return documentation;
}
exports.getHover = getHover;
function buildHoverDoc(symbol, elem) {
    let desc = "";
    if (elem.type.length > 1 || (["v", "c"].includes(elem.type) && /^\$self/.test(symbol))) {
        // We either know the object type, or it's $self
        desc = "(object) ";
        if (elem.type.length > 1) {
            desc += `${elem.type}`;
        }
        else if (/^\$self/.test(symbol)) {
            desc += `${elem.package}`;
        }
    }
    else if (elem.type == 'v') {
        // What should I show here? Nothing? Definition line?
    }
    else if (elem.type == 'c') {
        desc = `${elem.name}: ${elem.value}`;
        if (elem.package)
            desc += ` (${elem.package})`; // Is this ever known?
    }
    else if (elem.type == 'h') {
        desc = `${elem.name}  (${elem.package})`;
    }
    else if (elem.type == 's') {
        desc = `(subroutine) ${symbol}`;
    }
    else if (elem.type == 't' || elem.type == 'i') {
        desc = `(subroutine) ${elem.name}`;
        if (elem.typeDetail && elem.typeDetail != elem.name)
            desc = desc + ` (${elem.typeDetail})`;
    }
    else if (elem.type == 'p') {
        desc = `(package) ${elem.name}`;
    }
    else if (elem.type == 'm') {
        desc = `(module) ${elem.name}: ${elem.file}`;
    }
    else if (elem.type == 'l') { // Loop labels
        desc = `(label) ${symbol}`;
    }
    else {
        console.log("What is this thing? Fix me!");
    }
    return desc;
}
//# sourceMappingURL=hover.js.map