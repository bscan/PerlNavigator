"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAvailableMods = exports.getDefinition = void 0;
const vscode_uri_1 = require("vscode-uri");
const fs_1 = require("fs");
const utils_1 = require("./utils");
const path_1 = require("path");
function getDefinition(params, perlDoc, txtDoc) {
    let position = params.position;
    const symbol = (0, utils_1.getSymbol)(position, txtDoc);
    if (!symbol)
        return;
    console.log("Looking for: " + symbol);
    const foundElems = (0, utils_1.lookupSymbol)(perlDoc, symbol, position.line);
    if (foundElems.length == 0) {
        console.log("Could not find word: " + symbol);
        return;
    }
    let locationsFound = [];
    foundElems.forEach(elem => {
        const elemResolved = resolveElemForNav(perlDoc, elem, symbol);
        if (!elemResolved)
            return;
        // TODO: make this whole thing async
        if (!(0, fs_1.existsSync)(elemResolved.file))
            return; // Make sure the file exists and hasn't been deleted.
        let uri = vscode_uri_1.default.file((0, fs_1.realpathSync)(elemResolved.file)).toString(); // Resolve symlinks
        const newLoc = {
            uri: uri,
            range: {
                start: { line: elemResolved.line, character: 0 },
                end: { line: elemResolved.line, character: 500 }
            }
        };
        locationsFound.push(newLoc);
    });
    return locationsFound;
}
exports.getDefinition = getDefinition;
function resolveElemForNav(perlDoc, elem, symbol) {
    if (elem.file && !badFile(elem.file)) {
        // Have file and is good.
        return elem;
    }
    else {
        // Try looking it up by package instead of file.
        // Happens with XS subs and Moo subs
        if (elem.package) {
            const elemResolved = perlDoc.elems.get(elem.package);
            if ((elemResolved === null || elemResolved === void 0 ? void 0 : elemResolved.length) && elemResolved[0].file && !badFile(elem.file)) {
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
function badFile(file) {
    return /(?:Sub[\\\/]Defer\.pm|Moo[\\\/]Object\.pm|Moose[\\\/]Object\.pm)$/.test(file);
}
async function getAvailableMods(workspaceFolders, settings) {
    let perlParams = [];
    perlParams = perlParams.concat((0, utils_1.getIncPaths)(workspaceFolders, settings));
    const modHunterPath = (0, path_1.join)((0, path_1.dirname)(__dirname), 'src', 'perl', 'lib_bs22', 'ModHunter.pl');
    perlParams.push(modHunterPath);
    console.log("Starting to look for perl modules with " + perlParams.join(" "));
    const mods = new Map();
    let output;
    try {
        // This can be slow, especially if reading modules over a network or on windows. 
        const out = await (0, utils_1.async_execFile)(settings.perlPath, perlParams, { timeout: 90000, maxBuffer: 3 * 1024 * 1024 });
        output = out.stdout;
        console.log("Success running mod hunter");
    }
    catch (error) {
        console.log("ModHunter failed. You will lose autocomplete on importing modules. Not a huge deal");
        console.log(error);
        return mods;
    }
    output.split("\n").forEach(mod => {
        var items = mod.split('\t');
        if (items.length != 5 || items[1] != 'M' || !items[2] || !items[3]) {
            return;
        }
        // Load file
        (0, fs_1.realpath)(items[3], function (err, path) {
            if (err) {
                // Skip if error
            }
            else {
                if (!path)
                    return; // Could file be empty, but no error?
                let uri = vscode_uri_1.default.file(path).toString(); // Resolve symlinks
                mods.set(items[2], uri);
            }
        });
    });
    return mods;
}
exports.getAvailableMods = getAvailableMods;
//# sourceMappingURL=navigation.js.map