import {
    DefinitionParams,
    DocumentFormattingParams,
    TextEdit,
    DocumentRangeFormattingParams,
    Position,
    Range,
    WorkspaceFolder
} from 'vscode-languageserver/node';
import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem, NavigatorSettings } from "./types";
import {  async_execFile, getPerlimportsProfile, nLog } from "./utils";
import { dirname, join } from 'path';
import Uri from 'vscode-uri';
import { execFileSync } from 'child_process';
import { getPerlAssetsPath } from "./assets";


export function formatDoc(params: DocumentFormattingParams, txtDoc: TextDocument, settings: NavigatorSettings): TextEdit[] | undefined {
    return maybeReturnEdits(
        Range.create(
            Position.create(0,0),
            Position.create( txtDoc.lineCount, 0),
        ),
        txtDoc,
        settings
    )
}

export function formatRange(params: DocumentRangeFormattingParams, txtDoc: TextDocument, settings: NavigatorSettings): TextEdit[] | undefined {
    const offset = params.range.end.character > 0 ? 1 : 0;

    return maybeReturnEdits(
        Range.create(
            Position.create(params.range.start.line, 0),
            Position.create(params.range.end.line + offset, 0)
        ),
        txtDoc,
        settings
    );
}

function maybeReturnEdits (range: Range, txtDoc: TextDocument, settings: NavigatorSettings): TextEdit[] | undefined {
    const text = txtDoc.getText(range);
    if ( !text) {
        return;
    }

    let newSource: string = "";
    const fixedImports = perlimports(txtDoc, text, settings);
    if (fixedImports){
        newSource = fixedImports; 
    }
    const tidedSource = perltidy(fixedImports || text, settings);
    if (tidedSource){
        newSource = tidedSource; 
    }

    if (!newSource) { // If we failed on both tidy and imports
        return;
    }

    const edits: TextEdit = {
        range: range,
        newText: newSource
    };
    return [edits];
}

function perlimports(doc: TextDocument, code: string, settings: NavigatorSettings): string | undefined {
    if(!settings.perlimportsTidyEnabled) return;
    const importsPath = join(getPerlAssetsPath(), 'perlimportsWrapper.pl');
    let cliParams: string[] = [importsPath].concat(getPerlimportsProfile(settings));
    cliParams = cliParams.concat(['--filename', Uri.parse(doc.uri).fsPath]);

    try {
        const output = execFileSync(settings.perlPath, cliParams, {timeout: 25000, input: code}).toString();
        return output;
    } catch(error: any) {
        nLog("Attempted to run perlimports tidy " + error.stdout, settings);
        return;
    }
}

function perltidy(code: string, settings: NavigatorSettings): string | undefined {
    if(!settings.perltidyEnabled) return;
    const tidy_path = join(getPerlAssetsPath(), 'tidyWrapper.pl');
    let tidyParams: string[] = [tidy_path].concat(getTidyProfile(settings));

    nLog("Now starting perltidy with: " + tidyParams.join(" "), settings);

    let output: string | Buffer;
    try {
        output = execFileSync(settings.perlPath, tidyParams, {timeout: 25000, input: code});
        output = output.toString();
    } catch(error: any) {
        nLog("Perltidy failed with unknown error", settings);
        nLog(error, settings);
        return;
    }
    console.log("Ran tidy:");
    console.log(output);
    let pieces = output.split('ee4ffa34-a14f-4609-b2e4-bf23565f3262');
    if (pieces.length > 1){
        return pieces[1];
    } else {
        return;
    }
}

function getTidyProfile (settings: NavigatorSettings): string[] {
    let profileCmd: string[] = [];
    if (settings.perltidyProfile) {
        let profile = settings.perltidyProfile;
        profileCmd.push('--profile');
        profileCmd.push(profile);
    }
    return profileCmd;
}


// Deal with the $workspaceFolder functionality later:
// function getTidyProfile (workspaceFolders: WorkspaceFolder[] | null, settings: NavigatorSettings): string[] {
//     let profileCmd: string[] = [];
//     if (settings.perltidyProfile) {
//         let profile = settings.perltidyProfile;
//         if (/\$workspaceFolder/.test(profile)){
//             if (workspaceFolders){
//                 // TODO: Fix this. Only uses the first workspace folder
//                 const workspaceUri = Uri.parse(workspaceFolders[0].uri).fsPath;
//                 profileCmd.push('--profile');
//                 profileCmd.push(profile.replace(/\$workspaceFolder/g, workspaceUri));
//             } else {
//                 nLog("You specified $workspaceFolder in your perltidy path, but didn't include any workspace folders. Ignoring profile.", settings);
//             }
//         } else {
//             profileCmd.push('--profile');
//             profileCmd.push(profile);
//         }
//     }
//     return profileCmd;
// }
