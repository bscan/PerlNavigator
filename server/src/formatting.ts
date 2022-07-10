import {
    DefinitionParams,
    DocumentFormattingParams,
    TextEdit,
    DocumentRangeFormattingParams,
    WorkspaceFolder
} from 'vscode-languageserver/node';
import {
    TextDocument
} from 'vscode-languageserver-textdocument';
import { PerlDocument, PerlElem, NavigatorSettings } from "./types";
import {  nLog } from "./utils";
import { dirname, join } from 'path';
import { execFileSync } from 'child_process';
import { getPerlAssetsPath } from "./assets";


export function formatDoc(params: DocumentFormattingParams, txtDoc: TextDocument, settings: NavigatorSettings): TextEdit[] | undefined {
    const text = txtDoc.getText();
    const fixedSource = perltidy(text, settings);
    const start = { line: 0, character: 0 };
    const end = { line: txtDoc.lineCount, character: 0 };
    const range = {start, end};
    if(fixedSource){
        let edits: TextEdit = {
            range: range,
            newText: fixedSource
        };
        return [edits];
    } else {
        return;
    }
} 

export function formatRange(params: DocumentRangeFormattingParams, txtDoc: TextDocument, settings: NavigatorSettings): TextEdit[] | undefined {

    const start = { line: params.range.start.line, character: 0 };
    const offset = params.range.end.character > 0 ? 1 : 0;
    const end = { line: params.range.end.line + offset, character: 0 };
    const range = {start, end};
    const text = txtDoc.getText(range);

    const fixedSource = perltidy(text, settings);

    if(fixedSource){
        let edits: TextEdit = {
            range: range,
            newText: fixedSource
        };
        return [edits];
    } else {
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
