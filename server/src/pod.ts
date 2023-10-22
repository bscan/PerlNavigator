import fs = require("fs");
import { PerlDocument, PerlElem, PerlSymbolKind } from "./types";
import Uri from "vscode-uri";

export async function getPod(elem: PerlElem, perlDoc: PerlDocument): Promise<string | undefined> {
    // File may not exists. Return nothing if it doesn't

    const absolutePath = resolvePathForDoc(elem, perlDoc);
    if(!absolutePath) return;

    try {
        var fileContent = await fs.promises.readFile(absolutePath, "utf8");
    } catch {
        return;
    }

    // Initialize state variables
    let inPodBlock = false;
    let inRelevantBlock = true;
    let podContent = "";
    let podBuffer = ""; // We "buffer" pod when searching to avoid empty sections
    let meaningFullContent = false;
    let searchItem;
    if([PerlSymbolKind.Package, PerlSymbolKind.Module].includes(elem.type)){
        // Search all. Note I'm not really treating packages different from Modules
    } else if([PerlSymbolKind.ImportedSub, PerlSymbolKind.Method, PerlSymbolKind.Inherited, PerlSymbolKind.PathedField].includes(elem.type)){
        searchItem = elem.name;
        searchItem = searchItem.replace(/^[\w:]+::(\w+)$/, "$1"); // Remove package
    } else {
        return;
    }

    // Split the file into lines and iterate through them
    const lines = fileContent.split("\n");
    for (const line of lines) {
        if (line.match(/^=cut/)) {
            // =cut lines are not added.
            inPodBlock = false;
        }

         if (line.match(/^=(pod|head\d|over|item|back|begin|end|for|encoding)/)) {
            inPodBlock = true;
            meaningFullContent = false;
            if(line.match(new RegExp(`^=(head\\d|item).*\\b${searchItem}\\b`))){
                // This is structured so if we hit two relevant block in a row, we keep them both
                inRelevantBlock = true;
            } else {
                inRelevantBlock = false;
                podBuffer = "";
            }
        } else if(line.match(/\w/)){
            // For this section, we found something that's not a header and has content
            meaningFullContent = true;
        }

        if(inPodBlock){
            if(searchItem){
                if(inRelevantBlock) {
                    podBuffer += line + "\n";   
                }
            }
            else {
                podContent += line + "\n";
            }
        }

        if(meaningFullContent){
            podContent += podBuffer;
            podBuffer = "";
        }
    }

    const markDown = convertPODToMarkdown(podContent);

    return markDown;
}

const resolvePathForDoc = (elem: PerlElem, perlDoc: PerlDocument): string | undefined => {
    let absolutePath = Uri.parse(elem.uri).fsPath;

    const badFile = (c: string) => /\w+\.c$/.test(c);

    if(badFile(absolutePath)){
        // Lookup by package or module?
        if (elem.package) {
            const elemResolved = perlDoc.elems.get(elem.package);
            if (elemResolved) {
                for (let potentialElem of elemResolved) {
                    const potentialPath = Uri.parse(potentialElem.uri).fsPath;
                    if (potentialPath.length > 1 && !badFile(potentialPath)) {
                        absolutePath = potentialPath;
                        break;
                    }
                }
            }
        }
        if(badFile(absolutePath)){
            return;
        }
    }
    return absolutePath;
}

type ConversionState = {
    inList: boolean;
    inVerbatim: boolean;
    inCustomBlock: boolean;
    markdown: string;
    encoding: string | null; // Currently processed, but not used
    waitingForListTitle: boolean;
};

const convertPODToMarkdown = (pod: string): string => {
    let finalMarkdown: string = "";
    let state: ConversionState = {
        inList: false,
        inVerbatim: false,
        inCustomBlock: false,
        markdown: "",
        encoding: null,
        waitingForListTitle: false,
    };

    const lines = pod.split("\n");

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // Check for verbatim blocks first, perhaps ending a prior one
        if (shouldConsiderVerbatim(line) || state.inVerbatim) {
            state = processVerbatim(line, state);
            finalMarkdown += state.markdown;
            if (state.inVerbatim) {
                // Don't need to keep going if we're still in verbatim mode
                continue;
            }
        }

        // Inline transformations for code, bold, etc.
        line = processInlineElements(line);

        // Handling =pod to start documentation
        if (line.startsWith("=pod")) {
            continue; // Generally, we just skip this.
        }
        // Headings
        else if (line.startsWith("=head")) {
            const output = processHeadings(line);

            if(output != "\n## NAME\n" && /\w/.test(finalMarkdown)){
                // I find it a waste of space to include the headline "NAME". We're short on space in the hover 
                finalMarkdown += processHeadings(line);
            }
        }
        // List markers and items
        else if (line.startsWith("=over") || line.startsWith("=item") || line.startsWith("=back") || state.waitingForListTitle) {
            state = processList(line, state);
            finalMarkdown += state.markdown;
        }
        // Custom blocks like =begin and =end
        else if (line.startsWith("=begin") || line.startsWith("=end")) {
            state = processCustomBlock(line, state);
            finalMarkdown += state.markdown;
        }
        // Format-specific blocks like =for
        else if (line.startsWith("=for")) {
            finalMarkdown += processFormatSpecificBlock(line);
        }
        // Encoding
        else if (line.startsWith("=encoding")) {
            state = processEncoding(line, state);
        }

        else if(state.inList){
            if(line){
                finalMarkdown += ` ${line} `;
            }
        }
        // Generic text
        else {
            finalMarkdown += `${line}\n`;
        }
    }

    return finalMarkdown;
};

const processHeadings = (line: string): string => {
    // Extract the heading level from the line. This will be a number from 1-6.
    let level = parseInt(line.slice(5, 6));
    level = Math.min(level, 4); // Maximum 6 indentation levels in Markdown
    // Ensure that the heading level is valid.
    if (isNaN(level) || level < 1 || level > 6) {
        return "";
    }

    // Extract the actual text of the heading, which follows the =head command.
    const text = line.slice(7).trim();

    // Convert the heading to its Markdown equivalent. I marked head1 -> ### because I prefer the compact form.
    const markdownHeading = `\n##${"#".repeat(level)} ${text}\n`;

    return markdownHeading;
};

const processList = (line: string, state: ConversionState): ConversionState => {
    let markdown: string = "";

    // The =over command starts a list.
    if (line.startsWith("=over")) {
        state.inList = true;
        markdown = "\n";
    }

    // The =item command denotes a list item.
    else if (/^=item \*\s*$/.test(line)) {
        state.waitingForListTitle= true;
        markdown = "";
    } else if (state.waitingForListTitle && /[^\s]/.test(line)) {
        state.waitingForListTitle = false;
        markdown = `\n- ${line}  \n  `;
    }

    // The =item command denotes a list item.
    else if (line.startsWith("=item")) {
        state.inList = true;

        // Remove the '=item' part to get the actual text for the list item.
        let listItem = line.substring(6).trim();
        listItem = listItem.replace(/^\*/,""); // Doubled up list identifiers
        markdown = `\n- ${listItem}  \n  `; // Unordered list
    }
    // The =back command ends the list.
    else if (line.startsWith("=back")) {
        state.inList = false;
        markdown = "\n";
    }

    return {
        ...state,
        markdown,
    };
};

const processCustomBlock = (line: string, state: ConversionState): ConversionState => {
    let markdown = "";

    // =begin starts a custom block
    if (line.startsWith("=begin")) {
        // Extract the format following =begin
        const format = line.slice(7).trim();
        state.inCustomBlock = true;

        // Choose Markdown representation based on the format
        switch (format) {
            case "code":
                markdown = "```perl\n";
                break;
            // Add cases for other formats as needed
            default:
                markdown = `<!-- begin ${format} -->\n`;
                break;
        }
    }
    // =end ends the custom block
    else if (line.startsWith("=end")) {
        // Extract the format following =end
        const format = line.slice(5).trim();
        state.inCustomBlock = false;

        // Close the Markdown representation
        switch (format) {
            case "code":
                markdown = "```\n";
                break;
            // Add cases for other formats as needed
            default:
                markdown = `<!-- end ${format} -->\n`;
                break;
        }
    }

    return {
        ...state,
        markdown,
    };
};

const processFormatSpecificBlock = (line: string): string => {
    // The `=for` command itself is followed by the format and then the text.
    const parts = line.split(" ").slice(1);

    if (parts.length < 2) {
        return "";
    }

    // Extract the format and the actual text.
    const format = parts[0].trim();
    const text = parts.slice(1).join(" ").trim();

    // Choose the Markdown representation based on the format.
    let markdown = "";
    switch (format) {
        case "text":
            // Plain text, just add it.
            markdown = `${text}\n`;
            break;
        case "html":
            // If it's HTML, encapsulate it within comments for safety.
            markdown = `<!-- HTML: ${text} -->\n`;
            break;
        // Add more cases as you find the need for other specific formats.
        default:
            // For unsupported or custom formats, wrap it in a comment.
            markdown = `<!-- ${format} block: ${text} -->\n`;
            break;
    }

    return markdown;
};

const processInlineElements = (line: string): string => {

    // Handle code (C<code>), while allowing E<> replacements
    line = line.replace(/C<((?:[^<>]|[EL]<[^<>]+>)+?)>/g, (match, code) => escapeBackticks(code));

    // Unfortunately doesn't require the <<< to be matched in quantity. E<> is allowed automatically
    line = line.replace(/C<< (.+?) >>/g, (match, code) => escapeBackticks(code));
    line = line.replace(/C<<<+ (.+?) >+>>/g, (match, code) => escapeBackticks(code));

    // Handle special characters (E<entity>)
    line = line.replace(/E<([^>]+)>/g, (match, entity) => convertE(entity));

    // Handle bold (B<bold>)
    line = line.replace(/B<([^>]+)>/g, "**$1**");

    // Handle italics (I<italic>)
    line = line.replace(/I<([^>]+)>/g, "*$1*");

    // Handle links (L<name>), we'll just keep the name for now
    line = line.replace(/L<([^>]+)>/g, "[$1]");

    // Handle non-breaking spaces (S<text>)
    line = line.replace(/S<([^>]+)>/g, "$1");

    // Handle file names (F<name>), converting to italics
    line = line.replace(/F<([^>]+)>/g, "*$1*");

    // Handle index entries (X<entry>), ignoring as Markdown doesn't have an index
    line = line.replace(/X<([^>]+)>/g, "");

    // Escape HTML entities last since we use them above
    line = escapeHTML(line);

    return line;
};


function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
  }
  


const escapeHTML = (str: string): string => {
    const map: { [key: string]: string } = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
        "\\\\": "\\", // Two backslashes become one

        // These are required for the regex to consume & to ensure they don't get mapped to amp style.
        "\\&": "\\&", 
        "\\<": "\\<", 
        '\\"': '\\"', 
        "\\'": "\\'", 
    };

    // If the number of backticks is odd, it means backticks are unbalanced
    const backtickCount = (str.match(/`/g) || []).length;
    const segments = str.split("`");

    if (backtickCount % 2 !== 0 || segments.length % 2 === 0) {
        // Handle the unbalanced backticks here
        str = str.replace(/`/g, "");
    }

    // Escape special characters and create a regex pattern
    const pattern = new RegExp( Object.keys(map).map(escapeRegExp).join('|'), 'g' );

    for (let i = 0; i < segments.length; i += 2) {
        segments[i] = segments[i].replace(pattern, (m) => map[m]);
    }

    return segments.join("`");
};

const escapeBackticks = (str: string): string => {
    let count = (str.match(/`/g) || []).length;
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

// Determine if the line should start a verbatim text block
const shouldConsiderVerbatim = (line: string): boolean => {
    // A verbatim block starts with a whitespace but isn't part of a list
    return /^\s+/.test(line);
};

// Process verbatim text blocks
const processVerbatim = (line: string, state: ConversionState): ConversionState => {
    let markdown = "";
    if (/^\s+/.test(line)) {
        // If this is the start of a new verbatim block, add Markdown code fence
        if (!state.inVerbatim) {
            markdown += "\n```\n";
        }
        state.inVerbatim = true;

        // Trim some starting whitespace and add the line to the block
        // Most pod code has 4 spaces or a tab, but I find 2 space indents most readable in the space constrained pop-up
        markdown += line.replace(/^(?:\s{4}|\t)/, "  ") + "\n";
    }
    // } else if(/^\s+/.test(line)){
    //     // Verbatim blocks in lists are tricky. Let's just do one line at a time for now so we don't need to keep track of indentation
    //     markdown = "```\n" + line + "```\n";
    //     state.isLineVerbatim = true;
    // }
    else if (state.inVerbatim) {
        // This line ends the verbatim block
        state.inVerbatim = false;
        markdown += "```\n"; // End the Markdown code fence
    }

    return {
        ...state,
        markdown,
    };
};

const processEncoding = (line: string, state: ConversionState): ConversionState => {
    // Extract the encoding type from the line
    const encodingType = line.split(" ")[1]?.trim();

    if (encodingType) {
        return {
            ...state,
            encoding: encodingType,
        };
    }

    return state;
};
