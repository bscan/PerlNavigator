import { basename, dirname, isAbsolute, resolve, sep } from "path";
import { homedir } from "os";
import { WorkspaceFolder } from "vscode-languageserver-protocol";
import { TextDocument } from "vscode-languageserver-textdocument";
import Uri from "vscode-uri";

import { parseFromUri } from "./parser";
import { isFile, nLog } from "./utils";
import {
    FileAssociations,
    NavigatorSettings,
    ParseType,
    PerlDocument,
    PerlElem,
    PerlNavigatorInitializationOptions,
} from "./types";

export function parseFileAssociations(initializationOptions: unknown): FileAssociations {
    const associations: FileAssociations = new Map();

    if (!initializationOptions || typeof initializationOptions !== "object") {
        return associations;
    }

    const config = (initializationOptions as PerlNavigatorInitializationOptions).perlnavigator?.fileAssociations;
    if (!config || typeof config !== "object") {
        return associations;
    }

    for (const [fileName, configuredValue] of Object.entries(config)) {
        if (!fileName.trim()) {
            continue;
        }

        const values = Array.isArray(configuredValue) ? configuredValue : [configuredValue];
        const configuredPaths = values
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter((value) => value.length > 0);

        if (configuredPaths.length > 0) {
            associations.set(fileName, configuredPaths);
        }
    }

    return associations;
}

export async function applyAssociatedFileSymbols(
    perlDoc: PerlDocument,
    textDocument: TextDocument,
    fileAssociations: FileAssociations,
    workspaceFolders: WorkspaceFolder[] | null,
    settings: NavigatorSettings
): Promise<PerlDocument> {
    const associatedUris = await resolveAssociatedFileUris(textDocument, fileAssociations, workspaceFolders, settings);

    let mergedDoc = perlDoc;
    for (const associatedUri of associatedUris) {
        const associatedDoc = await parseFromUri(associatedUri, ParseType.selfNavigation);
        if (!associatedDoc) {
            nLog(`Unable to parse associated file '${Uri.parse(associatedUri).fsPath}'`, settings);
            continue;
        }
        mergedDoc = mergeAssociatedPerlDocs(mergedDoc, associatedDoc);
    }

    return mergedDoc;
}

export async function resolveAssociatedFileUris(
    textDocument: TextDocument,
    fileAssociations: FileAssociations,
    workspaceFolders: WorkspaceFolder[] | null,
    settings: NavigatorSettings
): Promise<string[]> {
    const documentPath = Uri.parse(textDocument.uri).fsPath;
    if (!documentPath) {
        return [];
    }

    const configuredPaths = fileAssociations.get(basename(documentPath));
    if (!configuredPaths || configuredPaths.length === 0) {
        return [];
    }

    const owningWorkspace = getOwningWorkspacePath(documentPath, workspaceFolders);
    const documentDir = dirname(documentPath);
    const resolvedUris = new Set<string>();

    for (const configuredPath of configuredPaths) {
        const resolvedPath = resolveAssociatedPath(configuredPath, owningWorkspace, documentDir);
        if (resolvedPath === documentPath) {
            continue;
        }

        if (!(await isFile(resolvedPath))) {
            nLog(
                `Configured associated file '${configuredPath}' for '${basename(documentPath)}' was not found at '${resolvedPath}'`,
                settings
            );
            continue;
        }

        resolvedUris.add(Uri.file(resolvedPath).toString());
    }

    return Array.from(resolvedUris);
}

function resolveAssociatedPath(configuredPath: string, workspacePath: string | undefined, documentDir: string): string {
    const expandedPath = expandTilde(configuredPath);
    if (isAbsolute(expandedPath)) {
        return resolve(expandedPath);
    }

    if (workspacePath) {
        return resolve(workspacePath, expandedPath);
    }

    return resolve(documentDir, expandedPath);
}

function expandTilde(filePath: string): string {
    if (filePath.startsWith("~/")) {
        return homedir() + filePath.slice(1);
    }

    return filePath;
}

function getOwningWorkspacePath(documentPath: string, workspaceFolders: WorkspaceFolder[] | null): string | undefined {
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
    }

    for (const workspaceFolder of workspaceFolders) {
        const workspacePath = Uri.parse(workspaceFolder.uri).fsPath;
        if (!workspacePath) {
            continue;
        }

        if (documentPath === workspacePath || documentPath.startsWith(workspacePath + sep)) {
            return workspacePath;
        }
    }
}

function mergeAssociatedPerlDocs(primaryDoc: PerlDocument, fallbackDoc: PerlDocument): PerlDocument {
    return {
        elems: mergeElemMaps(primaryDoc.elems, fallbackDoc.elems),
        canonicalElems: mergeSingleValueMaps(primaryDoc.canonicalElems, fallbackDoc.canonicalElems),
        autoloads: mergeSingleValueMaps(primaryDoc.autoloads, fallbackDoc.autoloads),
        imported: mergeSingleValueMaps(primaryDoc.imported, fallbackDoc.imported),
        parents: mergeSingleValueMaps(primaryDoc.parents, fallbackDoc.parents),
        uri: primaryDoc.uri,
    };
}

function mergeElemMaps(primaryMap: Map<string, PerlElem[]>, fallbackMap: Map<string, PerlElem[]>): Map<string, PerlElem[]> {
    const merged = new Map<string, PerlElem[]>();

    fallbackMap.forEach((elements, name) => {
        merged.set(name, [...elements]);
    });

    primaryMap.forEach((elements, name) => {
        const existing = merged.get(name);
        merged.set(name, existing ? [...elements, ...existing] : [...elements]);
    });

    return merged;
}

function mergeSingleValueMaps<T>(primaryMap: Map<string, T>, fallbackMap: Map<string, T>): Map<string, T> {
    const merged = new Map<string, T>(fallbackMap);
    primaryMap.forEach((value, key) => {
        merged.set(key, value);
    });

    return merged;
}
