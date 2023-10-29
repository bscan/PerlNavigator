import { DefinitionParams, Location, WorkspaceFolder } from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { PerlDocument, PerlElem, NavigatorSettings, ElemSource, ParseType } from "./types";
import Uri from "vscode-uri";
import { realpathSync, existsSync, realpath, promises } from "fs";
import { getIncPaths, async_execFile, getSymbol, lookupSymbol, nLog, isFile } from "./utils";
import { dirname, join } from "path";
import { getPerlAssetsPath } from "./assets";
import { refineElement } from "./refinement";

export async function getDefinition(params: DefinitionParams, perlDoc: PerlDocument, txtDoc: TextDocument, modMap: Map<string, string>): Promise<Location[] | undefined> {
    let position = params.position;
    const symbol = getSymbol(position, txtDoc);

    if (!symbol) return;

    const foundElems = lookupSymbol(perlDoc, modMap, symbol, position.line);

    if (foundElems.length == 0) {
        return;
    }

    let locationsFound: Location[] = [];

    for (const elem of foundElems) {
        const elemResolved: PerlElem | undefined = await resolveElemForNav(perlDoc, elem, symbol);
        if (!elemResolved) continue;

        let uri: string;
        if (perlDoc.uri !== elemResolved.uri) {
            // If sending to a different file, let's make sure it exists and clean up the path
            const file = Uri.parse(elemResolved.uri).fsPath;

            if (!(await isFile(file))) continue; // Make sure the file exists and hasn't been deleted.

            uri = Uri.file(realpathSync(file)).toString(); // Resolve symlinks
        } else {
            // Sending to current file (including untitled files)
            uri = perlDoc.uri;
        }

        const newLoc: Location = {
            uri: uri,
            range: {
                start: { line: elemResolved.line, character: 0 },
                end: { line: elemResolved.line, character: 500 },
            },
        };

        locationsFound.push(newLoc);
    }
    // const count = locationsFound
    return locationsFound;
}


async function resolveElemForNav(perlDoc: PerlDocument, elem: PerlElem, symbol: string): Promise<PerlElem | undefined> {
    let refined = await refineElement(elem, perlDoc);
    elem = refined || elem;
    if (!badFile(elem.uri)) {
        if (perlDoc.uri == elem.uri && symbol.includes("->")) {
            // Corinna methods don't have line numbers. Let's hunt for them. If you dont find anything better, just return the original element.
            const method = symbol.split("->").pop();
            if (method) {
                // Shouldn't this always be defined? Double check
                const found = perlDoc.elems.get(method);

                if (found) {
                    if (elem.line == 0 && elem.type == "x") {
                        if (found[0].uri == perlDoc.uri) return found[0];
                    } else if (elem.line > 0 && elem.type == "t") {
                        // Solve the off-by-one error at least for these. Eventually, you could consult a tagger for this step.

                        for (let potentialElem of found) {
                            if (Math.abs(potentialElem.line - elem.line) <= 1) {
                                return potentialElem;
                            }
                        }
                    }
                }
            }
            // Otherwise give-up
        }

        // Normal path; file is good
        return elem;
    } else {
        // Try looking it up by package instead of file.
        // Happens with XS subs and Moo subs
        if (elem.package) {
            const elemResolved = perlDoc.elems.get(elem.package);
            if (elemResolved) {
                for (let potentialElem of elemResolved) {
                    if (potentialElem.uri && !badFile(potentialElem.uri)) {
                        return potentialElem;
                    }
                }
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

function badFile(uri: string): boolean {
    if (!uri) {
        return true;
    }
    const fsPath = Uri.parse(uri).fsPath;

    if (!fsPath || fsPath.length <= 1) {
        // Single forward slashes seem to sneak in here.
        return true;
    }

    return /(?:Sub[\\\/]Defer\.pm|Moo[\\\/]Object\.pm|Moose[\\\/]Object\.pm|\w+\.c|Inspectorito\.pm)$/.test(fsPath);
}

export async function getAvailableMods(workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): Promise<Map<string, string>> {
    let perlParams = settings.perlParams;
    perlParams = perlParams.concat(getIncPaths(workspaceFolders, settings));
    const modHunterPath = join(getPerlAssetsPath(), "lib_bs22", "ModHunter.pl");
    perlParams.push(modHunterPath);
    nLog("Starting to look for perl modules with " + perlParams.join(" "), settings);

    const mods: Map<string, string> = new Map();

    let output: string;
    try {
        // This can be slow, especially if reading modules over a network or on windows.
        const out = await async_execFile(settings.perlPath, perlParams, { timeout: 90000, maxBuffer: 20 * 1024 * 1024 });
        output = out.stdout;
        nLog("Success running mod hunter", settings);
    } catch (error: any) {
        nLog("ModHunter failed. You will lose autocomplete on importing modules. Not a huge deal", settings);
        nLog(error, settings);
        return mods;
    }

    output.split("\n").forEach((mod) => {
        var items = mod.split("\t");

        if (items.length != 5 || items[1] != "M" || !items[2] || !items[3]) {
            return;
        }
        // Load file

        realpath(items[3], function (err, path) {
            if (err) {
                // Skip if error
            } else {
                if (!path) return; // Could file be empty, but no error?
                let uri = Uri.file(path).toString(); // Resolve symlinks
                mods.set(items[2], uri);
            }
        });
    });
    return mods;
}
