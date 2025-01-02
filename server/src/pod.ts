import fs = require("fs");
import { PerlDocument, PerlElem, PerlSymbolKind } from "./types";
import Uri from "vscode-uri";
import { isFile } from "./utils";

// Error types

export type PodParseError = RawPodParseError | PodProcessingError;

export interface RawPodParseError {
    kind: "parseerror";
    message: string;
    lineNo: number;
}

export interface PodProcessingError {
    kind: "processingerror";
    message: string;
}

/** A paragraph whose first line matches `^[ \t]`.
 *
 * May also be *inside* `=begin [formatname]` and `=end [formatname]` commands,
 * as long as [formatname] starts with a colon `:`.
 */
export interface VerbatimParagraph {
    kind: "verbatim";
    lineNo?: number;
    lines: Array<string>;
}

/** Not a CommandParagraph and not a VerbatimParagraph. Basically just
 * arbitrary text.
 *
 * May also be *inside* `=begin [formatname]` and `=end [formatname]` commands,
 * as long as [formatname] starts with a colon `:`.
 */
export interface OrdinaryParagraph {
    kind: "ordinary";
    lineNo?: number;
    lines: Array<string>;
}

/** Contents *inside* `=begin [formatname] [parameter]` and `=end [formatname]`
 * commands, as long as [formatname] does *not* start with a colon `:`.
 */
export interface DataParagraph {
    kind: "data";
    lineNo?: number;
    lines: Array<string>;
}

// Concrete command paragraphs
//
// Note: `=pod` and `=cut` aren't typed here, as they're already represented
// by a `PodBlock`.

export const enum HeaderLevel {
    One = 1,
    Two,
    Three,
    Four,
    Five,
    Six,
}

/** Represents `=head1` until `=head6`.
 */
export interface HeaderParagraph {
    kind: "head";
    lineNo?: number;
    level: HeaderLevel;
    contents: string;
}

/** Represents `=over`.
 */
export interface OverParagraph {
    kind: "over";
    lineNo?: number;
    level: number; // non-zero and `4` by default
}

/** Represents `=back`.
 */
export interface BackParagraph {
    kind: "back";
    lineNo?: number;
}

/** Represents `=item *` or a plain `=item`.
 * May be followed by text.
 */
export interface UnordererdItemParagraph {
    kind: "unordereditem";
    lineNo?: number;
    lines?: Array<string>;
}

/** `=item N` or `=item N.` where `N` is any whole number.
 * May be followed by text.
 */
export interface OrderedItemParagraph {
    kind: "ordereditem";
    num: number;
    lineNo?: number;
    lines?: Array<string>;
}

/** Represents `=encoding [encodingname]` - currently parsed, but unused.
 */
export interface EncodingParagraph {
    kind: "encoding";
    lineNo?: number;
    name: string;
}

/** Represents `=begin [formatname] [parameter]`.
 */
export interface BeginParagraph {
    kind: "begin";
    lineNo?: number;
    formatname: string;
    parameter: string;
}

/** Represents `=end [formatname]`.
 */
export interface EndParagraph {
    kind: "end";
    lineNo?: number;
    formatname: string;
}

/** Represents `=for [formatname] [contents]`.
 * If `formatname` begins with a colon `:`, `contents` will be interpreted
 * as an ordinary paragraph.
 *
 * If it doesn't begin with a colon, `contents` will be interpreted as a data
 * paragraph.
 */
export interface ForParagraph {
    kind: "for";
    lineNo?: number;
    formatname: string;
    lines: Array<string>;
}

/** Yielded if none of the other command paragraphs match.
 */
export interface UnknownCommandParagraph {
    kind: "unknown";
    lineNo?: number;
    cmd: string;
    contents: string;
}

export type CommandParagraph = HeaderParagraph
    | OverParagraph
    | BackParagraph
    | UnordererdItemParagraph
    | OrderedItemParagraph
    | EncodingParagraph
    | BeginParagraph
    | EndParagraph
    | ForParagraph
    | UnknownCommandParagraph;

export type PodParagraph = CommandParagraph
    | VerbatimParagraph
    | OrdinaryParagraph
    | DataParagraph;

/** Represents the "raw" raw paragraphs between `=pod ... =cut` commands.
 * "Raw" here means that all kinds of paragraphs can appear anywhere and in any
 * order -- no checks (beyond parsing the paragraphs correctly) are performed.
 *
 * During the parser's second pass, the paragraphs in this block are then
 * checked for their validity, e.g. whether `=over` is followed by a `=back`
 * and so on, before processing the block into a `PodBlock`.
 *
 * Repeated occurrences of `=pod` and `=cut` commands are ignored when this
 * block is being constructed.
 */
export interface RawPodBlock {
    kind: "rawpodblock";
    lineNo?: number;
    paragraphs: Array<PodParagraph>;
}

export type PodBlockContent = VerbatimParagraph
    | OrdinaryParagraph
    | HeaderParagraph
    | UnordererdItemParagraph
    | OrderedItemParagraph
    | EncodingParagraph
    | UnknownCommandParagraph
    | OverBlock
    | DataBlock
    | NormalDataBlock;

/** Represents a list of paragraphs and other blocks between `=pod ... =cut` commands.
 *
 * This kind of block is created by processing a `RawPodBlock` during the parser's
 * second pass.
 */
export interface PodBlock {
    kind: "podblock";
    lineNo?: number;
    paragraphs: Array<PodBlockContent>;
}

export type OverBlockContent = VerbatimParagraph
    | OrdinaryParagraph
    | UnordererdItemParagraph
    | OrderedItemParagraph
    | EncodingParagraph
    | UnknownCommandParagraph
    | OverBlock
    | DataBlock
    | NormalDataBlock;

/** Represents an `=over` ... `=back` block.
 * - Cannot be empty
 * - Cannot contain headers (HeaderParagraphs)
 */
export interface OverBlock {
    kind: "overblock";
    lineNo?: number;
    level: number; // non-zero and `4` by default
    paragraphs: Array<OverBlockContent>;
}

export type DataBlockContent = DataParagraph
    | DataBlock
    | NormalDataBlock;

/** Represents a `=begin [formatname] [parameter]` ... `=end [formatname]` block.
 * `formatname` must not begin with a colon `:`.
 *
 * This may also represents a `=for [formatname] text...` command.
 *
 * Other command paragraphs may *not* appear inside this type of block.
 * Verbatim and ordinary paragraphs become data paragraphs.
 */
export interface DataBlock {
    kind: "datablock";
    lineNo?: number;
    formatname: string;
    parameter: string;
    paragraphs: Array<DataBlockContent>;
}

/** Like a `DataBlock`, but `formatname` begins with a colon `:`.
 * This means that the contents inside the `=begin ... =end` block are subject
 * to normal processing.
 */
export interface NormalDataBlock {
    kind: "normaldatablock";
    lineNo?: number;
    formatname: string;
    parameter: string;
    paragraphs: Array<PodBlockContent>;
}

/** Represents a POD document which hasn't yet been processed further.
 */
export interface RawPodDocument {
    kind: "rawpoddocument",
    blocks: Array<RawPodBlock>;
}

/** A completely parsed and processed POD document.
 */
export interface PodDocument {
    kind: "poddocument",
    blocks: Array<PodBlock>;
}

/** Tracks the state for parsing POD content from a file.
 * See {@link parse} for more information.
 */
export class RawPodParser {
    #lineIter: Generator<string, void, undefined> = this.#makeLineIter([]);
    #currentLineNo: number = 0;
    #currentBlock?: RawPodBlock = undefined;
    #parsedBlocks: Array<RawPodBlock> = [];

    /** Parses and returns POD content from the given file contents.
     * Note that this returns a {@link RawPodDocument} on success, which contains
     * POD content that hasn't been processed and checked for validity yet.
     * This is done via the {@link PodProcessor}.
     */
    parse(fileContents: string): RawPodDocument | RawPodParseError {
        const lines = fileContents.split(/\r?\n/);

        // Reset state
        this.#lineIter = this.#makeLineIter(lines);
        this.#currentLineNo = 0;
        this.#currentBlock = undefined;
        this.#parsedBlocks = [];

        let line: string | undefined;
        while (true) {
            line = this.#getNextLine();

            // EOF
            if (line === undefined) {
                break;
            }

            // line is empty
            if (line === "") {
                continue;
            }

            if (/^=[a-zA-Z]/.test(line)) {
                if (line.startsWith("=cut")) {
                    if (this.#currentBlock !== undefined) {
                        this.#parsedBlocks.push(this.#currentBlock);
                        this.#currentBlock = undefined;
                    }

                    // ignoring repeated `=cut`s here, because they don't really matter

                    this.#skipUntilEmptyLine();
                    continue;
                }

                if (this.#currentBlock === undefined) {
                    this.#currentBlock = { kind: "rawpodblock", lineNo: this.#currentLineNo, paragraphs: [] };
                }

                if (line.startsWith("=pod")) {
                    this.#skipUntilEmptyLine();
                    continue;
                }

                // other command paragraphs
                let paraResult = this.#tryParseCommand(line);

                if (paraResult.kind === "parseerror") {
                    return paraResult;
                }

                // no need to skip to an empty line here, as that is handled for
                // each paragraph in tryParseCommand

                this.#currentBlock.paragraphs.push(paraResult);
                continue;
            }

            if (this.#currentBlock === undefined) {
                continue;
            }

            if (/^[ \t]/.test(line)) {
                let para = this.#parseVerbatim(line);

                this.#currentBlock.paragraphs.push(para);
                continue;
            }

            let para = this.#parseOrdinary(line);
            this.#currentBlock.paragraphs.push(para);
        }

        // allow file to end without needing a matching =cut
        if (this.#currentBlock !== undefined) {
            this.#parsedBlocks.push(this.#currentBlock);
            this.#currentBlock = undefined;
        }

        return {
            kind: "rawpoddocument",
            blocks: this.#parsedBlocks,
        };
    }

    *#makeLineIter(lines: string[]) {
        yield* lines;
    }

    #getNextLine(): string | undefined {
        let { value, done } = this.#lineIter.next();

        if (done || value === undefined) {
            return;
        }

        this.#currentLineNo++;

        return value;
    }

    #skipUntilEmptyLine(): void {
        let line: string | undefined;

        while (true) {
            line = this.#getNextLine();

            if (!line) {
                return;
            }
        }
    }

    #appendNextLineUntilEmptyLine(
        content: string,
        trimOpts: { trimStart?: boolean, trimEnd?: boolean } = {}
    ): string {
        let line: string | undefined;

        while (line = this.#getNextLine()) {
            if (trimOpts.trimStart && trimOpts.trimEnd) {
                line = line.trim();
            } else if (trimOpts.trimStart) {
                line = line.trimStart();
            } else if (trimOpts.trimEnd) {
                line = line.trimEnd();
            }

            content += " " + line;
        }

        return content;
    }


    static #parsedLevelToHeaderLevel(matchedLevel: string): HeaderLevel | undefined {
        const level = parseInt(matchedLevel);

        if (isNaN(level)) {
            return;
        }

        const levels = [
            undefined,
            HeaderLevel.One,
            HeaderLevel.Two,
            HeaderLevel.Three,
            HeaderLevel.Four,
            HeaderLevel.Five,
            HeaderLevel.Six,
        ] as const;

        return levels[level];
    }

    /** Tries to parse a command paragraph.
     * The passed `line` is expected to have matched `/^=[a-zA-Z]/` beforehand.
     */
    #tryParseCommand(line: string): PodParagraph | RawPodParseError {
        line = line.trimEnd();
        const lineNo = this.#currentLineNo;

        let matchResult;

        // =head[1-6]
        matchResult = [...line.matchAll(/^=head(?<level>[1-6])(\s+(?<contents>.*))?/g)][0];
        if (matchResult !== undefined) {
            // Casts here are fine, because we only match expected level in regex
            const matchedLevel = matchResult.groups?.level as string;
            const level = RawPodParser.#parsedLevelToHeaderLevel(matchedLevel) as HeaderLevel;

            let contents = matchResult.groups?.contents || "";
            contents = this.#appendNextLineUntilEmptyLine(
                contents, { trimStart: true, trimEnd: true }
            );

            let para: HeaderParagraph = {
                kind: "head",
                lineNo: lineNo,
                contents: contents,
                level: level,
            };

            return para;
        }

        // =item
        // =item\s+*
        // =item\s+\d+\.?
        // =item\s+[text...]
        matchResult = [...line.matchAll(/^=item(\s+((?<asterisk>\*)\s*|((?<num>\d+)\.?\s*))?)?(?<text>.*)?/g)][0];
        if (matchResult !== undefined) {
            // =item *
            let asterisk = matchResult.groups?.asterisk;
            if (asterisk) {
                let text = matchResult.groups?.text;

                let para: UnordererdItemParagraph = {
                    kind: "unordereditem",
                    lineNo: lineNo,
                };

                if (text) {
                    this.#appendNextLineUntilEmptyLine(text, { trimStart: true, trimEnd: true });
                    para.lines = [text];
                } else {
                    this.#skipUntilEmptyLine();
                }

                return para;
            }

            // =item N.
            let num = matchResult.groups?.num;
            if (num) {
                let text = matchResult.groups?.text;

                let para: OrderedItemParagraph = {
                    kind: "ordereditem",
                    num: parseInt(num),
                    lineNo: lineNo,
                };

                if (text) {
                    this.#appendNextLineUntilEmptyLine(text, { trimStart: true, trimEnd: true });
                    para.lines = [text];
                } else {
                    this.#skipUntilEmptyLine();
                }

                return para;
            }

            // =item Lorem ipsum dolor ...
            let text = matchResult.groups?.text;
            if (text) {
                let currentLine: string | undefined = text;
                let lines: Array<string> = [];

                while (currentLine) {
                    lines.push(currentLine.trim());

                    currentLine = this.#getNextLine();
                }

                let para: UnordererdItemParagraph = {
                    kind: "unordereditem",
                    lineNo: lineNo,
                    lines: lines,
                };

                return para;
            }

            // =item
            let para: UnordererdItemParagraph = {
                kind: "unordereditem",
                lineNo: lineNo,
            };

            this.#skipUntilEmptyLine();

            return para;
        }

        // =encoding
        matchResult = [...line.matchAll(/^=encoding\s+(?<name>\S+)/g)][0];
        if (matchResult !== undefined) {
            let name = matchResult.groups?.name || "";

            this.#skipUntilEmptyLine();

            let para: EncodingParagraph = {
                kind: "encoding",
                lineNo: lineNo,
                name: name,
            };

            return para;
        }

        // =over
        matchResult = [...line.matchAll(/^=over(\s+(?<num>\d+(\.\d*)?))?/g)][0];
        if (matchResult !== undefined) {
            let matchedLevel = matchResult.groups?.num;

            let level: number = 0;

            if (matchedLevel !== undefined) {
                level = parseFloat(matchedLevel);
            }

            const defaultOverLevel = 4;

            level = level > 0 ? level : defaultOverLevel;

            this.#skipUntilEmptyLine();

            let para: OverParagraph = {
                kind: "over",
                lineNo: lineNo,
                level: level,
            };

            return para;
        }

        // =back
        if (line.startsWith("=back")) {
            this.#skipUntilEmptyLine();

            let para: BackParagraph = {
                kind: "back",
                lineNo: lineNo,
            };

            return para;
        }

        // =begin
        matchResult = [
            ...line.matchAll(
                /^=begin(\s+(?<formatname>:?[-a-zA-Z0-9_]+)(\s+(?<parameter>.*))?)?/g
            )
        ][0];
        if (matchResult !== undefined) {
            if (matchResult.groups?.formatname === undefined) {
                return {
                    kind: "parseerror",
                    lineNo: lineNo,
                    message: `"=begin" command at line ${lineNo} does not contain any format name`,
                };
            }

            let parameter = matchResult.groups?.parameter || "";
            parameter = this.#appendNextLineUntilEmptyLine(parameter).trim();

            let para: BeginParagraph = {
                kind: "begin",
                lineNo: lineNo,
                formatname: matchResult.groups?.formatname?.trim() as string,
                parameter: parameter,
            };

            return para;
        }

        // =end
        matchResult = [...line.matchAll(/^=end(\s+(?<formatname>:?[-a-zA-Z0-9_]+))?/g)][0];
        if (matchResult !== undefined) {
            if (matchResult.groups?.formatname === undefined) {
                return {
                    kind: "parseerror",
                    lineNo: lineNo,
                    message: `"=end" command at line ${lineNo} does not contain any format name`,
                };
            }

            this.#skipUntilEmptyLine();

            let para: EndParagraph = {
                kind: "end",
                lineNo: lineNo,
                formatname: matchResult.groups?.formatname?.trim() as string,
            };

            return para;
        }

        // =for
        matchResult = [
            ...line.matchAll(/^=for(\s+(?<formatname>:?[-a-zA-Z0-9_]+)(\s+(?<contents>.*))?)?/g)
        ][0];
        if (matchResult !== undefined) {
            const formatname = matchResult.groups?.formatname;

            if (formatname === undefined) {
                return {
                    kind: "parseerror",
                    lineNo: lineNo,
                    message: `"=for" command at line ${lineNo} does not contain any format name`,
                };
            }

            let contents = (matchResult.groups?.contents || "").trim();

            // similar to parsing an ordinary or verbatim paragraph
            let currentLine: string | undefined = contents;
            let lines: Array<string> = [];

            while (currentLine) {
                lines.push(currentLine.trimEnd());

                currentLine = this.#getNextLine();
            }

            let para: ForParagraph = {
                kind: "for",
                lineNo: lineNo,
                formatname: formatname,
                lines: lines,
            };

            return para;
        }

        // unknown command paragraph; just parse it so we can toss it later
        matchResult = [...line.matchAll(/^=(?<cmd>\S+)(\s+(?<contents>.*))?/g)][0];
        if (matchResult !== undefined) {
            let contents = matchResult.groups?.contents || "";
            contents = this.#appendNextLineUntilEmptyLine(contents);

            let para: UnknownCommandParagraph = {
                kind: "unknown",
                lineNo: lineNo,
                cmd: matchResult.groups?.cmd as string,
                contents: contents,
            };

            return para;
        }

        return {
            kind: "parseerror",
            lineNo: lineNo,
            message: `failed to parse command from line ${lineNo}: "${line}" is not recognized as command paragraph`,
        };
    }

    /** Parses a verbatim paragraph.
     * The passed `line` is expected to have matched `/^[ \t]/` beforehand.
     */
    #parseVerbatim(line: string): VerbatimParagraph {
        let currentLine: string | undefined = line;
        const lineNo = this.#currentLineNo;

        let lines: Array<string> = [];

        // breaks if undefined or empty line
        while (currentLine) {
            lines.push(currentLine.trimEnd());

            currentLine = this.#getNextLine();
        }

        return {
            kind: "verbatim",
            lineNo: lineNo,
            lines: lines,
        };
    }

    /** Parses an ordinary paragraph.
     * The passed `line` is expected to have matched neither`/^=[a-zA-Z]` or
     * `/^[ \t]` beforehand.
     */
    #parseOrdinary(line: string): OrdinaryParagraph {
        let currentLine: string | undefined = line;
        const lineNo = this.#currentLineNo;

        let lines: Array<string> = [];

        // breaks if undefined or empty line
        while (currentLine) {
            lines.push(currentLine);

            currentLine = this.#getNextLine();
        }

        return {
            kind: "ordinary",
            lineNo: lineNo,
            lines: lines,
        };
    }
}

/** Tracks the state for processing a {@link RawPodDocument} into a proper
 * {@link PodDocument}.
 */
export class PodProcessor {
    #blockIter: Generator<RawPodBlock, void, undefined> = this.#makeBlockIter([]);
    #processedBlocks: Array<PodBlock> = [];

    /** Processes a {@link RawPodDocument} into a proper {@link PodDocument}.
     *
     * This checks whether the given raw document is valid (conforms as much to
     * the POD specification as possible) and also merges certain paragraphs for
     * ease of use.
     */
    process(document: RawPodDocument): PodDocument | PodProcessingError {
        // Reset state
        this.#blockIter = this.#makeBlockIter(document.blocks);
        this.#processedBlocks = [];

        const blockProcessor = new PodBlockProcessor();

        let currentBlock = this.#getNextBlock();
        while (currentBlock) {
            const processedBlockResult = blockProcessor.process(currentBlock);

            if (processedBlockResult.kind === "processingerror") {
                return processedBlockResult;
            }

            this.#processedBlocks.push(processedBlockResult);
            currentBlock = this.#getNextBlock();
        }

        return {
            kind: "poddocument",
            blocks: this.#processedBlocks,
        };
    }

    *#makeBlockIter(rawBlocks: Array<RawPodBlock>) {
        yield* rawBlocks;
    }

    #getNextBlock(): RawPodBlock | undefined {
        let { value, done } = this.#blockIter.next();

        if (done || value === undefined) {
            return;
        }

        return value;
    }
}

/** Inner workings of {@link PodProcessor}. */
class PodBlockProcessor {
    #paragraphIter: Generator<PodParagraph, void, undefined> = this.#makeParagraphIter([]);
    #podBlock: PodBlock = { kind: "podblock", paragraphs: [] };

    *#makeParagraphIter(paragraphs: Array<PodParagraph>) {
        yield* paragraphs;
    }

    #getNextParagraph(): PodParagraph | undefined {
        let { value, done } = this.#paragraphIter.next();

        if (done || value === undefined) {
            return;
        }

        return value;
    }

    process(block: RawPodBlock): PodBlock | PodProcessingError {
        // Reset state
        this.#paragraphIter = this.#makeParagraphIter(block.paragraphs);
        this.#podBlock = { kind: "podblock", paragraphs: [] };

        let para: PodParagraph | undefined;
        let previousPara: PodParagraph | undefined;

        while (true) {
            previousPara = para;
            para = this.#getNextParagraph();

            if (!para) {
                break;
            }

            switch (para.kind) {
                case "verbatim":
                    const lastPara = this.#podBlock.paragraphs[this.#podBlock.paragraphs.length - 1];

                    // Merge verbatim paragraphs for easier conversion later.
                    if (lastPara && lastPara.kind === "verbatim") {
                        let mergedLines = [...lastPara.lines, "", ...para.lines];

                        let mergedVerbatim: VerbatimParagraph = {
                            kind: "verbatim",
                            lineNo: lastPara.lineNo,
                            lines: mergedLines,
                        };

                        this.#podBlock.paragraphs[this.#podBlock.paragraphs.length - 1] = mergedVerbatim;
                        break;
                    }

                    this.#podBlock.paragraphs.push(para);
                    break;
                case "ordinary":
                case "unordereditem":
                case "ordereditem":
                case "head":
                    this.#podBlock.paragraphs.push(para);
                    break;
                case "data":
                    return {
                        kind: "processingerror",
                        message: 'encountered unexpected data paragraph',
                    };
                case "over":
                    let overBlockResult = this.#enterOverBlock(para);

                    if (overBlockResult.kind === "processingerror") {
                        return overBlockResult;
                    }

                    this.#podBlock.paragraphs.push(overBlockResult);
                    break;
                case "back":
                    return {
                        kind: "processingerror",
                        message: "'=back' does not have matching '=over'",
                    };
                case "begin":
                    let dataBlockResult = this.#enterDataBlock(para);

                    if (dataBlockResult.kind === "processingerror") {
                        return dataBlockResult;
                    }

                    this.#podBlock.paragraphs.push(dataBlockResult);
                    break;
                case "end":
                    return {
                        kind: "processingerror",
                        message: `'=end ${para.formatname}' does not have matching '=begin ${para.formatname}'`,
                    };
                case "for":
                    let forDataBlock = this.#buildDataBlockFromForPara(para);

                    this.#podBlock.paragraphs.push(forDataBlock);

                    break;
                case "encoding": // ignored
                case "unknown":  // ignored
                    break;
                default:
                    const _exhaustiveCheck: never = para;
                    return _exhaustiveCheck;
            }
        }

        return this.#podBlock;
    }

    // `level` must be non-zero.
    #enterOverBlock(paragraph: OverParagraph): OverBlock | PodProcessingError {
        let overBlock: OverBlock = {
            kind: "overblock",
            lineNo: paragraph.lineNo,
            level: paragraph.level,
            paragraphs: [],
        };

        let isProcessingBlock = true;
        let para: PodParagraph | undefined;

        while (isProcessingBlock) {
            para = this.#getNextParagraph();

            if (para === undefined) {
                return {
                    kind: "processingerror",
                    message: 'unexpected end of paragraphs while processing "=over ... =back" block',
                };
            }

            switch (para.kind) {
                case "verbatim":
                    const lastPara = overBlock.paragraphs[overBlock.paragraphs.length - 1];

                    // Merge verbatim paragraphs for easier conversion later.
                    if (lastPara && lastPara.kind === "verbatim") {
                        let mergedLines = [...lastPara.lines, "", ...para.lines];

                        let mergedVerbatim: VerbatimParagraph = {
                            kind: "verbatim",
                            lineNo: lastPara.lineNo,
                            lines: mergedLines,
                        };

                        overBlock.paragraphs[overBlock.paragraphs.length - 1] = mergedVerbatim;
                        break;
                    }

                    overBlock.paragraphs.push(para);
                    break;
                case "ordinary":
                case "unordereditem":
                case "ordereditem":
                    overBlock.paragraphs.push(para);
                    break;
                case "head":
                    return {
                        kind: "processingerror",
                        message: `encountered invalid paragraph in "=over ... =back" block: "=head${para.level} ${para.contents}"`
                    };
                case "data":
                    return {
                        kind: "processingerror",
                        message: 'encountered unexpected data paragraph in "=over ... =back" block',
                    };
                case "over":
                    let nestedOverBlockResult = this.#enterOverBlock(para);

                    if (nestedOverBlockResult.kind === "processingerror") {
                        return nestedOverBlockResult;
                    }

                    overBlock.paragraphs.push(nestedOverBlockResult);
                    break;
                case "back":
                    isProcessingBlock = false;
                    break;
                case "begin":
                    let nestedDataBlockResult = this.#enterDataBlock(para);

                    if (nestedDataBlockResult.kind === "processingerror") {
                        return nestedDataBlockResult;
                    }

                    overBlock.paragraphs.push(nestedDataBlockResult);
                    break;
                case "end":
                    return {
                        kind: "processingerror",
                        message: `'=end ${para.formatname}' does not have matching '=begin ${para.formatname}'`,
                    };
                case "for":
                    let nestedForDataBlock = this.#buildDataBlockFromForPara(para);

                    overBlock.paragraphs.push(nestedForDataBlock);
                case "encoding": // ignored
                case "unknown":  // ignored
                    break;
                default:
                    const _exhaustiveCheck: never = para;
                    return _exhaustiveCheck;
            }
        }

        return overBlock;
    }

    #enterDataBlock(paragraph: BeginParagraph): DataBlock | NormalDataBlock | PodProcessingError {
        if (paragraph.formatname.startsWith(":")) {
            return this.#buildNormalDataBlock(paragraph);
        } else {
            return this.#buildDataBlock(paragraph);
        }
    }

    #buildDataBlock(paragraph: BeginParagraph): DataBlock | PodProcessingError {
        let dataBlock: DataBlock = {
            kind: "datablock",
            formatname: paragraph.formatname,
            parameter: paragraph.parameter,
            paragraphs: [],
        };

        let isProcessingBlock = true;
        let para: PodParagraph | undefined;

        while (isProcessingBlock) {
            para = this.#getNextParagraph();

            if (para === undefined) {
                return {
                    kind: "processingerror",
                    message: `unexpected end of paragraphs while processing "=begin ${dataBlock.formatname} ... =end ${dataBlock.formatname}" block`,
                };
            }

            switch (para.kind) {
                case "ordinary":
                case "verbatim":
                    const lastPara = dataBlock.paragraphs[dataBlock.paragraphs.length - 1];

                    // Ordinary and verbatim paragraphs are merged into the previous data paragraph.
                    if (lastPara && lastPara.kind === "data") {
                        let mergedLines = [...lastPara.lines, "", ...para.lines];

                        let mergedData: DataParagraph = {
                            kind: "data",
                            lineNo: lastPara.lineNo,
                            lines: mergedLines,
                        };

                        dataBlock.paragraphs[dataBlock.paragraphs.length - 1] = mergedData;
                        break;
                    }

                    let dataPara: DataParagraph = {
                        kind: "data",
                        lines: para.lines,
                    };

                    dataBlock.paragraphs.push(dataPara);

                    break;
                case "data":
                    return {
                        kind: "processingerror",
                        message: `pre-existing data paragraph in "=begin ${dataBlock.formatname} ... =end ${dataBlock.formatname}" block`,
                    };
                case "encoding":
                case "unordereditem":
                case "ordereditem":
                case "head":
                case "over":
                case "back":
                case "unknown":
                    return {
                        kind: "processingerror",
                        message: `unexpected command paragraph "${para.kind}" in "=begin ${dataBlock.formatname} ... =end ${dataBlock.formatname}" block`,
                    };
                case "begin":
                    let nestedDataBlockResult = this.#enterDataBlock(para);

                    if (nestedDataBlockResult.kind === "processingerror") {
                        return nestedDataBlockResult;
                    }

                    dataBlock.paragraphs.push(nestedDataBlockResult);
                    break;
                case "end":
                    const [beginFmtName, endFmtName] = [dataBlock.formatname.trim(), para.formatname.trim()];

                    if (beginFmtName !== endFmtName) {
                        return {
                            kind: "processingerror",
                            message: `"=end ${endFmtName}" does not match "=begin ${beginFmtName}"`,
                        };
                    }

                    isProcessingBlock = false;
                    break;
                case "for":
                    let nestedForDataBlock = this.#buildDataBlockFromForPara(para);

                    dataBlock.paragraphs.push(nestedForDataBlock);
                    break;
                default:
                    const _exhaustiveCheck: never = para;
                    return _exhaustiveCheck;
            }
        }

        return dataBlock;
    }

    #buildNormalDataBlock(paragraph: BeginParagraph): NormalDataBlock | PodProcessingError {
        let dataBlock: NormalDataBlock = {
            kind: "normaldatablock",
            formatname: paragraph.formatname,
            parameter: paragraph.parameter,
            paragraphs: [],
        };

        let isProcessingBlock = true;
        let para: PodParagraph | undefined;

        while (isProcessingBlock) {
            para = this.#getNextParagraph();

            if (para === undefined) {
                return {
                    kind: "processingerror",
                    message: `unexpected end of paragraphs while processing "=begin ${dataBlock.formatname} ... =end ${dataBlock.formatname}" block`,
                };
            }

            switch (para.kind) {
                case "verbatim":
                    const lastPara = dataBlock.paragraphs[dataBlock.paragraphs.length - 1];

                    // Merge verbatim paragraphs for easier conversion later.
                    if (lastPara && lastPara.kind === "verbatim") {
                        let mergedLines = [...lastPara.lines, "", ...para.lines];

                        let mergedVerbatim: VerbatimParagraph = {
                            kind: "verbatim",
                            lineNo: lastPara.lineNo,
                            lines: mergedLines,
                        };

                        dataBlock.paragraphs[dataBlock.paragraphs.length - 1] = mergedVerbatim;
                        break;
                    }

                    dataBlock.paragraphs.push(para);
                    break;
                case "ordinary":
                case "unordereditem":
                case "ordereditem":
                case "head":
                    dataBlock.paragraphs.push(para);
                    break;
                case "data":
                    return {
                        kind: "processingerror",
                        message: `unexpected data paragraph in "=begin ${dataBlock.formatname} ... =end ${dataBlock.formatname}" block`,
                    };
                case "over":
                    let overBlockResult = this.#enterOverBlock(para);

                    if (overBlockResult.kind === "processingerror") {
                        return overBlockResult;
                    }

                    dataBlock.paragraphs.push(overBlockResult);
                    break;
                case "back":
                    return {
                        kind: "processingerror",
                        message: "'=back' does not have matching '=over'",
                    };
                case "begin":
                    let dataBlockResult = this.#enterDataBlock(para);

                    if (dataBlockResult.kind === "processingerror") {
                        return dataBlockResult;
                    }

                    dataBlock.paragraphs.push(dataBlockResult);
                    break;
                case "end":
                    const [beginFmtName, endFmtName] = [dataBlock.formatname.trim(), para.formatname.trim()];

                    if (beginFmtName !== endFmtName) {
                        return {
                            kind: "processingerror",
                            message: `"=end ${endFmtName}" does not match "=begin ${beginFmtName}"`,
                        };
                    }

                    isProcessingBlock = false;
                    break;
                case "for":
                    let nestedForDataBlock = this.#buildDataBlockFromForPara(para);

                    dataBlock.paragraphs.push(nestedForDataBlock);
                    break;
                case "encoding": // ignored
                case "unknown":  // ignored
                    break;
                default:
                    const _exhaustiveCheck: never = para;
                    return _exhaustiveCheck;
            }
        }

        return dataBlock;
    }

    #buildDataBlockFromForPara(paragraph: ForParagraph): DataBlock | NormalDataBlock {
        if (paragraph.formatname.startsWith(":")) {
            let paragraphs: Array<PodBlockContent>;

            if (paragraph.lines.length === 0) {
                paragraphs = [];
            } else {
                paragraphs = [
                    {
                        kind: "ordinary",
                        lines: paragraph.lines,
                    }
                ];
            }

            return {
                kind: "normaldatablock",
                formatname: paragraph.formatname,
                parameter: "",
                paragraphs: paragraphs,
            };
        }

        let paragraphs: Array<DataBlockContent>;
        if (paragraph.lines.length === 0) {
            paragraphs = [];
        } else {
            paragraphs = [
                {
                    kind: "data",
                    lines: paragraph.lines,
                }
            ];
        }

        return {
            kind: "datablock",
            formatname: paragraph.formatname,
            parameter: "",
            paragraphs: paragraphs,
        };
    }
}

/** Tracks the state for converting a {@link PodDocument} or {@link PodBlock}
 * into Markdown.
 */
export class PodToMarkdownConverter {
    #blockContentIter: Generator<PodBlockContent, void, undefined> = this.#makeBlockContentIter([]);
    #overBlockIndentLevels: Array<number> = [];

    /** Converts a {@link PodDocument} or {@link PodBlock} to Markdown. */
    convert(pod: PodDocument | PodBlock): string {
        let blocks: Array<PodBlock>;

        if (pod.kind === "poddocument") {
            blocks = pod.blocks;
        } else {
            blocks = [pod];
        }

        // Reset state
        this.#blockContentIter = this.#makeBlockContentIter(blocks);
        this.#overBlockIndentLevels = [];

        // Need to wrap getNextBlockContent into closure here,
        // otherwise we get an access violation
        const markdownLines = this.#convertContentUntilDone(
            () => this.#getNextBlockContent()
        );

        let finalLines: Array<string> = [];

        for (const line of markdownLines) {
            let processedLine = line;

            if (processedLine.trim() === "") {
                processedLine = "";
            }

            finalLines.push(processedLine);
        }

        if (finalLines.length === 0) {
            return "";
        }

        return finalLines.join("\n").trimEnd() + "\n";
    }

    #convertContentUntilDone(
        getNext: () => PodBlockContent | undefined,
    ): Array<string> {
        let lines: Array<string> = [];

        let content: PodBlockContent | undefined;
        let previousContent: PodBlockContent | undefined;

        while (true) {
            previousContent = content;
            content = getNext();

            if (!content) {
                break;
            }

            if (!previousContent) {
                lines.push(...this.#convertBlockContent(content, getNext));
                continue;
            }

            if (isOverBlockWithItem(content)) {
                if (!isItem(previousContent)) {
                    ensureLastLineEmpty(lines);
                    lines.push(...this.#convertBlockContent(content, getNext));
                    continue;
                }

                lines.push(...this.#convertBlockContent(content, getNext));
                continue;
            }

            // Consecutive list items are rendered without an empty line inbetween.
            // Keeps the list visually coherent.
            if (!(isItem(content) && isItem(previousContent))) {
                ensureLastLineEmpty(lines);
                lines.push(...this.#convertBlockContent(content, getNext));
                continue;
            }

            lines.push(...this.#convertBlockContent(content, getNext));
        }

        return lines;
    }

    *#makeBlockContentIter(blocks: Array<PodBlock>) {
        for (const block of blocks) {
            yield* block.paragraphs;
        }
    }

    #getNextBlockContent(): PodBlockContent | undefined {
        let { value, done } = this.#blockContentIter.next();

        if (done || value === undefined) {
            return;
        }

        return value;
    }

    #convertBlockContent(
        content: PodBlockContent,
        getNext: () => PodBlockContent | undefined,
    ): Array<string> {
        switch (content.kind) {
            case "verbatim":
                return this.#convertVerbatimPara(content);
            case "ordinary":
                return this.#convertOrdinaryPara(content);
            case "head":
                return this.#convertHeaderPara(content);
            case "unordereditem":
            case "ordereditem":
                return this.#convertItemPara(content, getNext);
            case "overblock":
                return this.#convertOverBlock(content);
            case "datablock":
                return this.#convertDataBlock(content);
            case "normaldatablock":
                return this.#convertNormalDataBlock(content);
            case "encoding": // ignored
            case "unknown":  // ignored
                return [];
            default:
                const _exhaustiveCheck: never = content;
                return _exhaustiveCheck;
        }
    }

    #convertVerbatimPara(verbatimPara: VerbatimParagraph): Array<string> {
        return [
            "```",
            ...verbatimPara.lines.map((line) => tabsToSpaces(line, 8)),
            "```",
        ];
    }

    #convertOrdinaryPara(ordinaryPara: OrdinaryParagraph): Array<string> {
        return ordinaryPara.lines
            .map((line) => tabsToSpaces(line, 8))
            .map(processInlineElements);
    }

    #convertHeaderPara(headerPara: HeaderParagraph): Array<string> {
        return [
            "#".repeat(headerPara.level) + " " + processInlineElements(headerPara.contents)
        ];
    }

    #convertItemPara(
        itemPara: UnordererdItemParagraph | OrderedItemParagraph,
        getNext: () => PodBlockContent | undefined,
    ): Array<string> {
        let itemBeginning: string;

        if (itemPara.kind === "unordereditem") {
            itemBeginning = "-";
        } else {
            itemBeginning = `${itemPara.num}.`;
        }

        const indentAndFormatList = (arr: Array<string>): Array<string> => {
            if (arr.length === 0) {
                return arr;
            }

            let newArr: Array<string> = [];

            newArr.push(itemBeginning + " " + arr[0]);
            const indentLevel = itemBeginning.length + 1;

            for (const line of arr.slice(1)) {
                newArr.push(" ".repeat(indentLevel) + line);
            }

            return newArr;
        };

        if (itemPara.lines && itemPara.lines.length > 0) {
            return indentAndFormatList(itemPara.lines.map(processInlineElements));
        }

        let nextContent = getNext();

        if (!nextContent) {
            return [itemBeginning];
        }

        if (nextContent.kind === "unordereditem" || nextContent.kind === "ordereditem") {
            return [
                itemBeginning,
                ...this.#convertItemPara(nextContent, getNext),
            ];
        }

        return indentAndFormatList(this.#convertBlockContent(nextContent, getNext));
    }

    #convertOverBlock(block: OverBlock): Array<string> {
        const currentIndentLevel: number = Math.round(block.level);
        this.#overBlockIndentLevels.push(currentIndentLevel);

        const indentList = (arr: Array<string>): Array<string> => {
            let newArr: Array<string> = [];

            const adjustedIndentLevel = this.#overBlockIndentLevels
                .reduce((a, b) => a + b, 0) - currentIndentLevel;

            if (adjustedIndentLevel === 0) {
                return arr;
            }

            for (const line of arr) {
                newArr.push(" ".repeat(adjustedIndentLevel) + line);
            }

            return newArr;
        }

        const overBlockIter = function* (): Generator<OverBlockContent, void, undefined> {
            yield* block.paragraphs;
        };

        const iter = overBlockIter();

        const getNext = () => {
            let { value, done } = iter.next();

            if (done || value === undefined) {
                return;
            }

            return value;
        };

        let lines: Array<string> = this.#convertContentUntilDone(getNext);

        if (lines[0]?.trim() === "") {
            lines.shift();
        }

        if (lines[lines.length - 1]?.trim() === "") {
            lines.pop();
        }

        let result = indentList(lines);
        this.#overBlockIndentLevels.pop();
        return result;
    }

    #convertDataBlock(block: DataBlock): Array<string> {
        const dataBlockIter = function* (): Generator<DataBlockContent, void, undefined> {
            yield* block.paragraphs;
        };

        const iter = dataBlockIter();

        const getNext = () => {
            let { value, done } = iter.next();

            if (done || value === undefined) {
                return;
            }

            return value;
        };

        let dataStart: string;
        let dataEnd: string;

        const formatname = block.formatname.trim();
        switch (formatname) {
            case "code":
                dataStart = "```perl";
                dataEnd = "```";
                break;
            case "html":
                dataStart = "```html";
                dataEnd = "```";
                break;
            case "text":
                dataStart = "";
                dataEnd = "";
                break;
            default:
                dataStart = `<!-- begin ${formatname} -->`;
                dataEnd = `<!-- end ${formatname} -->`
        }

        let lines: Array<string> = [];
        let dataBlockPara: DataBlockContent | undefined;

        lines.push(dataStart);

        while (dataBlockPara = getNext()) {
            switch (dataBlockPara.kind) {
                case "data":
                    lines.push(...dataBlockPara.lines);
                    break;
                case "datablock":
                    lines.push(dataEnd);
                    lines.push(...this.#convertDataBlock(dataBlockPara));
                    lines.push(dataStart);
                    break;
                case "normaldatablock":
                    lines.push(dataEnd);
                    lines.push(...this.#convertNormalDataBlock(dataBlockPara));
                    lines.push(dataStart);
                    break;
                default:
                    const _exhaustiveCheck: never = dataBlockPara;
                    return _exhaustiveCheck;
            }
        }

        lines.push(dataEnd);

        return lines;
    }

    #convertNormalDataBlock(block: NormalDataBlock): Array<string> {
        const normalDataBlockIter = function* (): Generator<PodBlockContent, void, undefined> {
            yield* block.paragraphs;
        };

        const iter = normalDataBlockIter();

        const getNext = () => {
            let { value, done } = iter.next();

            if (done || value === undefined) {
                return;
            }

            return value;
        };

        return this.#convertContentUntilDone(getNext);
    }
}

/** Appends an empty line if the last element in the list isn't an empty line already. */
function ensureLastLineEmpty(list: Array<string>) {
    if (list.at(-1)?.trim() !== "") {
        list.push("");
    }
}

function isItem(content: PodBlockContent): boolean {
    return ["unordereditem", "ordereditem"].includes(content.kind);
}

function isOverBlockWithItem(content: PodBlockContent): boolean {
    if (content.kind === "overblock") {
        const firstBlockContent = content.paragraphs.at(0);
        if (firstBlockContent && isItem(firstBlockContent)) {
            return true;
        }
    }

    return false;
}

function tabsToSpaces(line: string, spacesPerTab: number = 4): string {
    return line.replaceAll("\t", " ".repeat(spacesPerTab));
}

/** Quick search for leading comments of a very specific form with comment
 * blocks that preceed a sub (and aren't simply get/set without docs).
 *
 * Separate function in order to avoid overcomplicating the line-by-line POD parsing.
 */
function quickSearchByComment(symbolName: string, fileContent: string): string | undefined {
    let match, match2;

    let markdown: string | undefined;

    if (match = fileContent.match(`\\r?\\n#(?:####+| \-+) *(?:\\r?\\n# *)*${symbolName}\\r?\\n((?:(?:#.*| *)\\r?\\n)+)sub +${symbolName}\\b`)) {
        // Ensure it's not an empty get/set pair.
        if (
            !( 
                (match2 = symbolName.match(/^get_(\w+)$/))
                && match[1].match(new RegExp(`^(?:# +set_${match2[1]}\\r?\\n)?[\\s#]*$`))
            )
        ) {
            let content = match[1].replace(/^ *#+ ?/gm,'');
            content = content.replace(/^\s+|\s+$/g,'');

            // May still be empty for non-get functions
            if (content) {
                markdown = "```text\n" + content + "\n```\n";
            }
        }
    }

    return markdown;
}

function lookupSymbolInPod(symbolName: string, podDoc: PodDocument): PodDocument | undefined {
    const podDocIter = function* (
        doc: PodDocument
    ): Generator<PodBlockContent, void, undefined> {
        for (const block of doc.blocks) {
            for (const content of block.paragraphs) {
                yield content;
            }
        }
    }

    const iter = podDocIter(podDoc);
    const getNextContent = () => {
        const { value, done } = iter.next();

        if (done || value === undefined) {
            return;
        }

        return value;
    };

    let currentContent: PodBlockContent | undefined; 
    let foundHeader: HeaderParagraph | undefined;
    let extractedContents: Array<PodBlockContent> = [];

    while (currentContent = getNextContent()) {
        if (foundHeader) {
            if (currentContent.kind === "head" && currentContent.level <= foundHeader.level) {
                break;
            }

            extractedContents.push(currentContent);
        }

        if (
            currentContent.kind === "head" 
            && currentContent.contents.match(new RegExp(`^\\s*(\\$.*->)?${symbolName}(\\(.*\\))?\\b`))
        ) {
            foundHeader = currentContent;
            extractedContents.push(currentContent);
        }
    }

    if (extractedContents.length === 0) {
        return;
    }

    return {
        kind: "poddocument",
        blocks: [
            {
                kind: "podblock",
                paragraphs: extractedContents,
            },
        ],
    };
}

export async function getPod(
    elem: PerlElem,
    perlDoc: PerlDocument,
    modMap: Map<string, string>
): Promise<string | undefined> {
    let symbolName: string | undefined;

    switch (elem.type) {
        case PerlSymbolKind.Module:
        case PerlSymbolKind.Package:
            break;
        case PerlSymbolKind.ImportedSub:
        case PerlSymbolKind.Inherited:
        case PerlSymbolKind.PathedField:
        case PerlSymbolKind.LocalSub:
        case PerlSymbolKind.LocalMethod:
            symbolName = elem.name.replace(/^[\w:]+::(\w+)$/, "$1"); // Remove package
            break;
        default:
            return;
    }

    // File may not exist - return nothing if it doesn't.
    const absolutePath = await resolvePathForDoc(elem, perlDoc, modMap);

    if (!absolutePath) {
        return;
    }

    let fileContents: string;

    try {
        fileContents = await fs.promises.readFile(absolutePath, "utf8");
    } catch {
        return;
    }

    if (symbolName) {
        let quickSearchMarkdown = quickSearchByComment(symbolName, fileContents);
        if (quickSearchMarkdown) {
            return quickSearchMarkdown;
        }
    }

    let parser = new RawPodParser();
    let rawPodDocResult = parser.parse(fileContents);

    if (rawPodDocResult.kind === "parseerror") {
        // TODO: log error? --> needs access to settings for nLog
        return;
    }

    let processor = new PodProcessor();
    let podDocResult = processor.process(rawPodDocResult);

    if (podDocResult.kind === "processingerror") {
        // TODO: log error? --> needs access to settings for nLog
        return;
    }

    let podDoc: PodDocument | undefined = podDocResult;

    if (symbolName) {
        podDoc = lookupSymbolInPod(symbolName, podDocResult);
    }

    if (!podDoc) {
        return;
    }

    let converter = new PodToMarkdownConverter();
    let markdown = converter.convert(podDoc);

    if (!markdown) {
        return;
    }

    return markdown;
}

async function resolvePathForDoc(elem: PerlElem, perlDoc: PerlDocument, modMap: Map<string, string>): Promise<string | undefined> {
    let absolutePath = Uri.parse(elem.uri).fsPath;

    const foundPath = await fsPathOrAlt(absolutePath);
    if(foundPath){
        return foundPath;
    }

    if (elem.package) {
        let elemResolved = perlDoc.elems.get(elem.package);
        
        if(!elemResolved){

            // Looking up a module by the package name is only convention, but helps for things like POSIX
            const modUri = modMap.get(elem.package);
            if(modUri){
                let modPath = await fsPathOrAlt(Uri.parse(modUri).fsPath);
                if(modPath){
                    return modPath;
                }
            }
            return;
        }


        for (let potentialElem of elemResolved) {
            const potentialPath = Uri.parse(potentialElem.uri).fsPath;
            const foundPackPath = await fsPathOrAlt(potentialPath);
            if (foundPackPath) {
                return foundPackPath;
            }
        }
    }
    if(await badFile(absolutePath)){
        return;
    }

}

async function fsPathOrAlt(fsPath: string | undefined): Promise<string | undefined>{

    if(!fsPath){
        return;
    }

    if (/\.pm$/.test(fsPath)) {
        let podPath = fsPath.replace(/\.pm$/, ".pod");
        if (!await badFile(podPath)) {
            return podPath;
        }
    }
    if (!await badFile(fsPath)) {
        return fsPath;
    }
    return;

}

async function badFile(fsPath: string): Promise<boolean> {

    if (!fsPath || fsPath.length <= 1) {
        return true;
    }

    if( /\w+\.c$/.test(fsPath) ){
        return true;
    }

    if(!(await isFile(fsPath))){
        return true;
    }

    return false;
}

// Mapping backticks to the Unicode non-character U+FFFF which is not allowed to appear in text
const tempPlaceholder = '\uFFFF';

const processInlineElements = (line: string): string => {

    line = line.replaceAll('`', tempPlaceholder);

    // WWW::Mechanize is a good test for this one. Code blocks with embedded link
    line = line.replace(/C<([^<>]*)L<< (?:.+?\|\/?)?(.+?) >>([^<>]*)>/g, "C<< $1 $2 $3 >>");

    // Handle code (C<code>), while allowing E<> replacements
    line = line.replace(/C<((?:[^<>]|[EL]<[^<>]+>)+?)>/g, (match, code) => escapeBackticks(code));

    // Unfortunately doesn't require the <<< to be matched in quantity. E<> is allowed automatically
    line = line.replace(/C<<+\s+(.+?)\s+>+>/g, (match, code) => escapeBackticks(code));

    // Handle special characters (E<entity>)
    line = line.replace(/E<([^>]+)>/g, (match, entity) => convertE(entity));

    // Mapping the Unicode non-character U+FFFF back to escaped backticks
    line = line.replace(new RegExp(tempPlaceholder, 'g'), '\\`');

    // Handle bold italic (B<I<bold italic>>)
    line = line.replace(/B<I<([^<>]+)>>/g, "***$1***");
    line = line.replace(/B<I<<+\s+(.+?)\s+>>+>/g, "***$1***");
    line = line.replace(/B<<+\s+I<([^<>]+)>\s+>+>/g, "***$1***");
    line = line.replace(/B<<+\s+I<<+\s+(.+?)\s+>+>\s+>+>/g, "***$1***");

    // Handle italic bold (B<I<italic bold>>)
    line = line.replace(/I<B<([^<>]+)>>/g, "***$1***");
    line = line.replace(/I<B<<+\s+(.+?)\s+>>+>/g, "***$1***");
    line = line.replace(/I<<+\s+B<([^<>]+)>\s+>+>/g, "***$1***");
    line = line.replace(/I<<+\s+B<<+\s+(.+?)\s+>+>\s+>+>/g, "***$1***");

    // Handle bold (B<bold>)
    line = line.replace(/B<([^<>]+)>/g, "**$1**");
    line = line.replace(/B<<+\s+(.+?)\s+>+>/g, "**$1**");

    // Handle italics (I<italic>)
    line = line.replace(/I<([^<>]+)>/g, "*$1*");
    line = line.replace(/I<<+\s+(.+?)\s+>+>/g, "*$1*");

    // Handle links (L<name>), URLS auto-link in vscode's markdown
    line = line.replace(/L<(http[^>]+)>/g, " $1 ");

    line = line.replace(/L<([^<>]+)>/g, "`$1`");
    line = line.replace(/L<<+\s+(.*?)\s+>+>/g, "`$1`");

    // Handle non-breaking spaces (S<text>)
    line = line.replace(/S<([^<>]+)>/g, "$1");

    // Handle file names (F<name>), converting to italics
    line = line.replace(/F<([^<>]+)>/g, "*$1*");

    // Handle index entries (X<entry>), ignoring as Markdown doesn't have an index
    line = line.replace(/X<([^<>]+)>/g, "");

    return line;
};

const escapeBackticks = (str: string): string => {
    let count = (str.match(new RegExp(tempPlaceholder, 'g')) || []).length;
    str = str.replace(new RegExp(tempPlaceholder, 'g'), '`'); // Backticks inside don't need to be escaped.
    let delimiters = "`".repeat(count + 1);
    return `${delimiters}${str}${delimiters}`;
};

const convertE = (content: string): string => {
    
    switch (content) {
        case "lt":
            return "<";
        case "gt":
            return ">";
        case "verbar":
            return "|";
        case "sol":
            return "/";
        default:
            if (/^0x[\da-fA-F]+$/.test(content)) {
                return String.fromCodePoint(parseInt(content.substring(2), 16));
            } else if (/^0[0-7]+$/.test(content)) {
                return String.fromCodePoint(parseInt(content.substring(1), 8));
            } else if (/^\d+$/.test(content)) {
                return String.fromCodePoint(parseInt(content, 10));
            } else {
                return `&${content};`;
            }
    }
};
