import {
    HeaderLevel,
    OrdinaryParagraph,
    PodBlockContent,
    PodDocument,
    PodParagraph,
    RawPodParser,
    PodProcessor,
    RawPodDocument,
    VerbatimParagraph,
    PodToMarkdownConverter,
} from "./pod";

const podToMd = (fileContents: string): string => {
    const parser = new RawPodParser();
    const processor = new PodProcessor();
    const converter = new PodToMarkdownConverter();

    let parseRes = parser.parse(fileContents);
    let processRes = processor.process(parseRes);

    return converter.convert(processRes);
};


describe("basic parser and processor tests", () => {
    const parser = new RawPodParser();
    const processor = new PodProcessor();

    test("empty file returns empty document", () => {
        const fileContents = "";

        const expectedRaw: RawPodDocument = {
            kind: "rawpoddocument",
            blocks: [],
        };

        const expectedProcessed: PodDocument = {
            kind: "poddocument",
            blocks: [],
        };

        const result = parser.parse(fileContents);

        expect(result).toBeDefined();
        expect(result).toMatchObject(expectedRaw);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expectedProcessed);
    });

    test("single =pod ... =cut region", () => {
        const fileContents = `\
=pod

=cut
`;

        const expectedRaw: RawPodDocument = {
            kind: "rawpoddocument",
            blocks: [
                {
                    kind: "rawpodblock",
                    paragraphs: [],
                },
            ],
        };

        const expectedProcessed: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: [],
                },
            ],
        };

        const result = parser.parse(fileContents);

        expect(result).toBeDefined();
        expect(result).toMatchObject(expectedRaw);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expectedProcessed);
    });

    test("repeated =pod ... =cut regions with Perl", () => {
        const fileContents = `\
=pod

=cut

# This is a Perl comment and doesn't get parsed.
sub foo {
    my ($bar, $baz) = @_;

    die "baz didn't bar" if !defined($baz->($bar));

    return "foo $bar";
}

=pod

=cut

# =pod
#
# This should not get parsed
#
# =cut

=pod And this here
gets ignored.

=cut This here
as well.
`;

        const expectedRaw: RawPodDocument = {
            kind: "rawpoddocument",
            blocks: [
                {
                    kind: "rawpodblock",
                    paragraphs: [],
                },
                {
                    kind: "rawpodblock",
                    paragraphs: [],
                },
                {
                    kind: "rawpodblock",
                    paragraphs: [],
                },
            ],
        };

        const expectedProcessed: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: [],
                },
                {
                    kind: "podblock",
                    paragraphs: [],
                },
                {
                    kind: "podblock",
                    paragraphs: [],
                },
            ],
        };

        const result = parser.parse(fileContents);

        expect(result).toBeDefined();
        expect(result).toMatchObject(expectedRaw);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expectedProcessed);
    });

    test("repeated =pod command", () => {
        const fileContents = `\
=pod

=pod

=cut
`;

        const expected: RawPodDocument = {
            kind: "rawpoddocument",
            blocks: [
                {
                    kind: "rawpodblock",
                    paragraphs: [],
                },
            ],
        };

        expect(parser.parse(fileContents)).toMatchObject(expected);
    });

    test("repeated =cut command", () => {
        const fileContents = `\
=pod

=cut

=cut
`;

        const expected: RawPodDocument = {
            kind: "rawpoddocument",
            blocks: [
                {
                    kind: "rawpodblock",
                    paragraphs: [],
                },
            ],
        };

        expect(parser.parse(fileContents)).toMatchObject(expected);
    });

    test("unclosed pod block", () => {
        const fileContents = `\
=pod`;

        const expected: RawPodDocument = {
            kind: "rawpoddocument",
            blocks: [
                {
                    kind: "rawpodblock",
                    paragraphs: [],
                },
            ],
        };

        expect(parser.parse(fileContents)).toMatchObject(expected);
    });

    test("document with ordinary paragraph", () => {
        const fileContents = `\
=pod

This is an ordinary paragraph.

=cut
`;

        const expectedRaw: RawPodDocument = {
            kind: "rawpoddocument",
            blocks: [
                {
                    kind: "rawpodblock",
                    paragraphs: [
                        {
                            kind: "ordinary",
                            lines: ["This is an ordinary paragraph."],
                        },
                    ],
                },
            ],
        };

        const expectedProcessed: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: [
                        {
                            kind: "ordinary",
                            lines: ["This is an ordinary paragraph."],
                        },
                    ],
                },
            ],
        };

        const result = parser.parse(fileContents);

        expect(result).toBeDefined();
        expect(result).toMatchObject(expectedRaw);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expectedProcessed);
    });

    test("document with verbatim paragraph", () => {
        const fileContents = `\
=pod

 This is a verbatim paragraph. Notice the space.

=cut
`;

        const expectedRaw: RawPodDocument = {
            kind: "rawpoddocument",
            blocks: [
                {
                    kind: "rawpodblock",
                    paragraphs: [
                        {
                            kind: "verbatim",
                            lines: [" This is a verbatim paragraph. Notice the space."],
                        },
                    ],
                },
            ],
        };

        const expectedProcessed: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: [
                        {
                            kind: "verbatim",
                            lines: [" This is a verbatim paragraph. Notice the space."],
                        },
                    ],
                },
            ],
        };

        const result = parser.parse(fileContents);

        expect(result).toBeDefined();
        expect(result).toMatchObject(expectedRaw);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expectedProcessed);
    });

    test("document with ordinary and verbatim paragraphs", () => {
        const fileContents = `\
=pod

This is an ordinary paragraph. It spans a single line.

 This is a verbatim paragraph. It spans a single line.

This is an ordinary paragraph.
It spans two...
\tNo, three lines!

 This is a verbatim paragraph.
It spans two...
\tNo, three lines!
Actually, four. Sorry.

=cut
`;

        const paragraphs: Array<OrdinaryParagraph | VerbatimParagraph> = [
            {
                kind: "ordinary",
                lines: [
                    "This is an ordinary paragraph. It spans a single line.",
                ],
            },
            {
                kind: "verbatim",
                lines: [
                    " This is a verbatim paragraph. It spans a single line.",
                ],
            },
            {
                kind: "ordinary",
                lines: [
                    "This is an ordinary paragraph.",
                    "It spans two...",
                    "\tNo, three lines!",
                ],
            },
            {
                kind: "verbatim",
                lines: [
                    " This is a verbatim paragraph.",
                    "It spans two...",
                    "\tNo, three lines!",
                    "Actually, four. Sorry.",
                ],
            },
        ];

        const expectedRaw: RawPodDocument = {
            kind: "rawpoddocument",
            blocks: [
                {
                    kind: "rawpodblock",
                    paragraphs: paragraphs,
                },
            ],
        };

        const expectedProcessed: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: paragraphs,
                },
            ],
        };

        const result = parser.parse(fileContents);

        expect(result).toBeDefined();
        expect(result).toMatchObject(expectedRaw);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expectedProcessed);
    });

    test("document with multiple regions and various paragraphs", () => {
        const fileContents = `\
=pod

=head1 HEAD ONE


Lorem ipsum dolor sit amet, consectetur adipiscing elit.




=head2 HEAD TWO

Lorem ipsum dolor sit amet, consectetur adipiscing elit.


=head3 HEAD
THREE

    Lorem ipsum dolor sit amet, consectetur adipiscing elit.

=head4 HEAD
F
O
U
R

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

=head5 HEAD FIVE

=over

=item *





Lorem Ipsum.

=item          *

Dolor sit amet.

=item
*

Consectetur adipiscing elit.

=back

=head6 HEAD SIX

=over 3.5

=back

=over 42


=item Morbi ut iaculis orci. Praesent
vehicula risus sed leo commodo, sit amet
laoreet dolor consectetur.


=back

=over 0

=back



=head7 UNKNOWN COMMAND PARAGRAPH



=cut

# This is Perl and is ignored by the parser.
sub foobar {
    my ($foo, $bar) = @_;

    return "$foo $bar";
}


=pod

=encoding utf8

=begin foo


=end foo

=begin bar

Lorem ipsum dolor sit amet, consectetur adipiscing elit.


Lorem ipsum dolor sit amet, consectetur adipiscing elit.




Lorem ipsum dolor sit amet, consectetur adipiscing elit.

=end bar

=begin :baz some parameter stuff

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

=end :baz

=for comment This is a comment.

=for comment This is
a
multiline
comment.

=cut
`;

        const firstParagraphsRaw: Array<PodParagraph> = [
            {
                kind: "head",
                level: HeaderLevel.One,
                contents: "HEAD ONE",
            },
            {
                kind: "ordinary",
                lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
            },
            {
                kind: "head",
                level: HeaderLevel.Two,
                contents: "HEAD TWO",
            },
            {
                kind: "ordinary",
                lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
            },
            {
                kind: "head",
                level: HeaderLevel.Three,
                contents: "HEAD THREE",
            },
            {
                kind: "verbatim",
                lines: ["    Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
            },
            {
                kind: "head",
                level: HeaderLevel.Four,
                contents: "HEAD F O U R",
            },
            {
                kind: "ordinary",
                lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
            },
            {
                kind: "head",
                level: HeaderLevel.Five,
                contents: "HEAD FIVE",
            },
            {
                kind: "over",
                level: 4,
            },
            {
                kind: "unordereditem",
                lines: ["Lorem Ipsum."],
            },
            {
                kind: "unordereditem",
                lines: ["Dolor sit amet."],
            },
            {
                kind: "unordereditem",
                lines: ["Consectetur adipiscing elit."],
            },
            {
                kind: "back",
            },
            {
                kind: "head",
                level: HeaderLevel.Six,
                contents: "HEAD SIX",
            },
            {
                kind: "over",
                level: 3.5,
            },
            {
                kind: "back",
            },
            {
                kind: "over",
                level: 42,
            },
            {
                kind: "unordereditem",
                lines: [
                    "Morbi ut iaculis orci. Praesent",
                    "vehicula risus sed leo commodo, sit amet",
                    "laoreet dolor consectetur.",
                ],
            },
            {
                kind: "back",
            },
            {
                kind: "over",
                level: 4,
            },
            {
                kind: "back",
            },
            {
                kind: "unknown",
                cmd: "head7",
                contents: "UNKNOWN COMMAND PARAGRAPH",
            },
        ];

        const secondParagraphsRaw: Array<PodParagraph> = [
            {
                kind: "encoding",
                name: "utf8",
            },
            {
                kind: "begin",
                formatname: "foo",
                parameter: "",
            },
            {
                kind: "end",
                formatname: "foo",
            },
            {
                kind: "begin",
                formatname: "bar",
                parameter: "",
            },
            {
                kind: "ordinary",
                lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
            },
            {
                kind: "ordinary",
                lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
            },
            {
                kind: "ordinary",
                lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
            },
            {
                kind: "end",
                formatname: "bar",
            },
            {
                kind: "begin",
                formatname: ":baz",
                parameter: "some parameter stuff",
            },
            {
                kind: "ordinary",
                lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
            },
            {
                kind: "end",
                formatname: ":baz",
            },
            {
                kind: "for",
                formatname: "comment",
                lines: ["This is a comment."],
            },
            {
                kind: "for",
                formatname: "comment",
                lines: [
                    "This is",
                    "a",
                    "multiline",
                    "comment.",
                ],
            },
        ];

        const firstParagraphsProcessed: Array<PodBlockContent> = [
            {
                kind: "head",
                level: HeaderLevel.One,
                contents: "HEAD ONE",
            },
            {
                kind: "ordinary",
                lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
            },
            {
                kind: "head",
                level: HeaderLevel.Two,
                contents: "HEAD TWO",
            },
            {
                kind: "ordinary",
                lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
            },
            {
                kind: "head",
                level: HeaderLevel.Three,
                contents: "HEAD THREE",
            },
            {
                kind: "verbatim",
                lines: ["    Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
            },
            {
                kind: "head",
                level: HeaderLevel.Four,
                contents: "HEAD F O U R",
            },
            {
                kind: "ordinary",
                lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
            },
            {
                kind: "head",
                level: HeaderLevel.Five,
                contents: "HEAD FIVE",
            },
            {
                kind: "overblock",
                level: 4,
                paragraphs: [
                    {
                        kind: "unordereditem",
                        lines: ["Lorem Ipsum."],
                    },
                    {
                        kind: "unordereditem",
                        lines: ["Dolor sit amet."],
                    },
                    {
                        kind: "unordereditem",
                        lines: ["Consectetur adipiscing elit."],
                    },
                ],
            },
            {
                kind: "head",
                level: HeaderLevel.Six,
                contents: "HEAD SIX",
            },
            {
                kind: "overblock",
                level: 3.5,
                paragraphs: [],
            },
            {
                kind: "overblock",
                level: 42,
                paragraphs: [
                    {
                        kind: "unordereditem",
                        lines: [
                            "Morbi ut iaculis orci. Praesent",
                            "vehicula risus sed leo commodo, sit amet",
                            "laoreet dolor consectetur.",
                        ],
                    },
                ],
            },
            {
                kind: "overblock",
                level: 4,
                paragraphs: [],
            },
            // NOTE: unknown command paragraph is ignored and therefore not included here
        ];

        const secondParagraphsProcessed: Array<PodBlockContent> = [
            // NOTE: encoding command paragraph is ignored and therefore not included here
            {
                kind: "datablock",
                formatname: "foo",
                parameter: "",
                paragraphs: [],
            },
            {
                kind: "datablock",
                formatname: "bar",
                parameter: "",
                paragraphs: [
                    {
                        kind: "data",
                        lines: [
                            "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                            "",
                            "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                            "",
                            "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
                        ],
                    },
                ],
            },
            {
                kind: "normaldatablock",
                formatname: ":baz",
                parameter: "some parameter stuff",
                paragraphs: [
                    {
                        kind: "ordinary",
                        lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
                    },
                ],
            },
            {
                kind: "datablock",
                formatname: "comment",
                parameter: "",
                paragraphs: [
                    {
                        kind: "data",
                        lines: ["This is a comment."],
                    },
                ],
            },
            {
                kind: "datablock",
                formatname: "comment",
                parameter: "",
                paragraphs: [
                    {
                        kind: "data",
                        lines: [
                            "This is",
                            "a",
                            "multiline",
                            "comment.",
                        ],
                    },
                ],
            },
        ];

        const expectedRaw: RawPodDocument = {
            kind: "rawpoddocument",
            blocks: [
                {
                    kind: "rawpodblock",
                    paragraphs: firstParagraphsRaw,
                },
                {
                    kind: "rawpodblock",
                    paragraphs: secondParagraphsRaw,
                }
            ],
        };

        const expectedProcessed: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: firstParagraphsProcessed,
                },
                {
                    kind: "podblock",
                    paragraphs: secondParagraphsProcessed,
                },
            ],
        };

        const result = parser.parse(fileContents);

        expect(result).toMatchObject(expectedRaw);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expectedProcessed);
    });
});


describe("complex POD processing cases", () => {
    const parser = new RawPodParser();
    const processor = new PodProcessor();

    // Spec requires matching =end, but we choose to tolerate this
    test("unclosed data block", () => {
        const fileContents = `\
=pod

=begin foo

=cut
`;

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: [
                        {
                            kind: "datablock",
                            formatname: "foo",
                            paragraphs: [],
                            parameter: "",
                        },
                    ],
                },
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    // Spec requires matching =end, but we choose to tolerate this
    test("unclosed normal data block", () => {
        const fileContents = `\
=pod

=begin :foo

=cut
`;

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: [
                        {
                            kind: "normaldatablock",
                            formatname: ":foo",
                            paragraphs: [],
                            parameter: "",
                        },
                    ],
                },
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    // Spec requires matching =back, but we choose to tolerate this
    test("unclosed over block", () => {
        const fileContents = `\
=pod

=over 42

=cut
`;

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: [
                        {
                            kind: "overblock",
                            level: 42,
                            paragraphs: [],
                        },
                    ],
                },
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    test("over blocks with invalid indent levels", () => {
        const fileContents = `\
=pod

=over 0

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

=back

=over -1

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

=back

=cut
`;

        const paragraphs: Array<PodBlockContent> = [
            {
                kind: "overblock",
                level: 4,
                paragraphs: [
                    {
                        kind: "ordinary",
                        lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
                    },
                ],
            },
            {
                kind: "overblock",
                level: 4,
                paragraphs: [
                    {
                        kind: "ordinary",
                        lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
                    },
                ],
            },
        ];

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: paragraphs,
                }
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);

    })

    test("data block with ordinary and verbatim paragraphs", () => {
        const fileContents = `\
=pod

=begin foo bar

Ordinary.

 Verbatim.

Ordinary.
But longer.

\tVerbatim.
But longer.

=end foo

=cut
`;

        const paragraphs: Array<PodBlockContent> = [
            {
                kind: "datablock",
                formatname: "foo",
                parameter: "bar",
                paragraphs: [
                    {
                        kind: "data",
                        lines: [
                            "Ordinary.",
                            "",
                            " Verbatim.",
                            "",
                            "Ordinary.",
                            "But longer.",
                            "",
                            "\tVerbatim.",
                            "But longer.",
                        ],
                    },
                ],
            },
        ];

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: paragraphs,
                }
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    test("normal data block with ordinary and verbatim paragraphs", () => {
        const fileContents = `\
=pod

=begin :foo bar

Ordinary.

 Verbatim.

Ordinary.
But longer.

\tVerbatim.
But longer.

=end :foo

=cut
`;

        const paragraphs: Array<PodBlockContent> = [
            {
                kind: "normaldatablock",
                formatname: ":foo",
                parameter: "bar",
                paragraphs: [
                    {
                        kind: "ordinary",
                        lines: ["Ordinary."],
                    },
                    {
                        kind: "verbatim",
                        lines: [" Verbatim."],
                    },
                    {
                        kind: "ordinary",
                        lines: ["Ordinary.", "But longer."],
                    },
                    {
                        kind: "verbatim",
                        lines: ["\tVerbatim.", "But longer."],
                    },
                ],
            },
        ];

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: paragraphs,
                }
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    test("data block with command paragraph", () => {
        const fileContents = `\
=pod

=begin foo

Ordinary.

 Verbatim.

=head1 SOME COOL TITLE THAT GETS IGNORED

=end foo

=cut
`;
        const paragraphs: Array<PodBlockContent> = [
            {
                kind: "datablock",
                formatname: "foo",
                parameter: "",
                paragraphs: [
                    {
                        kind: "data",
                        lines: [
                            "Ordinary.",
                            "",
                            " Verbatim."
                        ],
                    },
                ],
            },
        ];

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: paragraphs,
                }
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    test("normal data block with command paragraph", () => {
        const fileContents = `\
=pod

=begin :foo

Ordinary.

 Verbatim.

=head1 SOME COOL TITLE THAT CAN ACTUALLY BE HERE

=end :foo

=cut
`;

        const paragraphs: Array<PodBlockContent> = [
            {
                kind: "normaldatablock",
                formatname: ":foo",
                parameter: "",
                paragraphs: [
                    {
                        kind: "ordinary",
                        lines: ["Ordinary."],
                    },
                    {
                        kind: "verbatim",
                        lines: [" Verbatim."],
                    },
                    {
                        kind: "head",
                        level: HeaderLevel.One,
                        contents: "SOME COOL TITLE THAT CAN ACTUALLY BE HERE",
                    },
                ],
            },
        ];

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: paragraphs,
                }
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    test("over block with header command paragraph", () => {
        const fileContents = `\
=pod

=over 42

=head1 I GET TOLERATED

=back

=cut
`;
        const paragraphs: Array<PodBlockContent> = [
            {
                kind: "overblock",
                level: 42,
                paragraphs: [
                    {
                        kind: "head",
                        level: HeaderLevel.One,
                        contents: "I GET TOLERATED",
                    },
                ],
            },
        ];

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: paragraphs,
                }
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    test("double-nested over block", () => {
        const fileContents = `\
=pod

=over

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

=over

=item *

Sed consequat, neque eu aliquam porttitor, tellus augue faucibus quam, a ornare neque dolor vitae dolor.

=item *

Pellentesque elementum luctus urna, et dapibus est faucibus eu.

=back

Mauris ut arcu ipsum.

=back

=cut
`;

        const paragraphs: Array<PodBlockContent> = [
            {
                kind: "overblock",
                level: 4,
                paragraphs: [
                    {
                        kind: "ordinary",
                        lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
                    },
                    {
                        kind: "overblock",
                        level: 4,
                        paragraphs: [
                            {
                                kind: "unordereditem",
                                lines: ["Sed consequat, neque eu aliquam porttitor, tellus augue faucibus quam, a ornare neque dolor vitae dolor."],
                            },
                            {
                                kind: "unordereditem",
                                lines: ["Pellentesque elementum luctus urna, et dapibus est faucibus eu."],
                            },
                        ],
                    },
                    {
                        kind: "ordinary",
                        lines: ["Mauris ut arcu ipsum."],
                    },
                ],
            },
        ];

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: paragraphs,
                }
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    test("deeply nested over block", () => {
        const fileContents = `\
=pod

=over

=over

=over

=over

=over

=over

=over

=over

=over

=over

I know this looks weird, but this is still valid POD.

=back

=back

=back

=back

=back

=back

=back

=back

=back

=back

=cut
`;

        const paragraphs: Array<PodBlockContent> = [
            {
                kind: "overblock",
                level: 4,
                paragraphs: [
                    {
                        kind: "overblock",
                        level: 4,
                        paragraphs: [

                            {
                                kind: "overblock",
                                level: 4,
                                paragraphs: [
                                    {
                                        kind: "overblock",
                                        level: 4,
                                        paragraphs: [
                                            {
                                                kind: "overblock",
                                                level: 4,
                                                paragraphs: [
                                                    {
                                                        kind: "overblock",
                                                        level: 4,
                                                        paragraphs: [
                                                            {
                                                                kind: "overblock",
                                                                level: 4,
                                                                paragraphs: [
                                                                    {
                                                                        kind: "overblock",
                                                                        level: 4,
                                                                        paragraphs: [
                                                                            {
                                                                                kind: "overblock",
                                                                                level: 4,
                                                                                paragraphs: [
                                                                                    {
                                                                                        kind: "overblock",
                                                                                        level: 4,
                                                                                        paragraphs: [
                                                                                            {
                                                                                                kind: "ordinary",
                                                                                                lines: ["I know this looks weird, but this is still valid POD."],
                                                                                            },
                                                                                        ],
                                                                                    },
                                                                                ],
                                                                            },
                                                                        ],
                                                                    },
                                                                ],
                                                            },
                                                        ],
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ];

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: paragraphs,
                }
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    test("double-nested data block", () => {
        const fileContents = `\
=pod

=begin foo

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

=begin bar

Sed consequat, neque eu aliquam porttitor, tellus augue faucibus quam, a ornare neque dolor vitae dolor.

Pellentesque elementum luctus urna, et dapibus est faucibus eu.

=end bar

Mauris ut arcu ipsum.

=end foo

=cut
`;

        const paragraphs: Array<PodBlockContent> = [
            {
                kind: "datablock",
                formatname: "foo",
                parameter: "",
                paragraphs: [
                    {
                        kind: "data",
                        lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
                    },
                    {
                        kind: "datablock",
                        formatname: "bar",
                        parameter: "",
                        paragraphs: [
                            {
                                kind: "data",
                                lines: [
                                    "Sed consequat, neque eu aliquam porttitor, tellus augue faucibus quam, a ornare neque dolor vitae dolor.",
                                    "",
                                    "Pellentesque elementum luctus urna, et dapibus est faucibus eu.",
                                ],
                            },
                        ],
                    },
                    {
                        kind: "data",
                        lines: ["Mauris ut arcu ipsum."],
                    },
                ],
            },
        ];

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: paragraphs,
                }
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    test("deeply nested data block", () => {
        const fileContents = `\
=pod

=begin one

=begin two

=begin three

=begin four

=begin five

=begin six

=begin seven

=begin eight

=begin nine

=begin ten

I know this looks weird, but this is still valid POD.

=end ten

=end nine

=end eight

=end seven

=end six

=end five

=end four

=end three

=end two

=end one

=cut
`;

        const paragraphs: Array<PodBlockContent> = [
            {
                kind: "datablock",
                formatname: "one",
                parameter: "",
                paragraphs: [
                    {
                        kind: "datablock",
                        formatname: "two",
                        parameter: "",
                        paragraphs: [

                            {
                                kind: "datablock",
                                formatname: "three",
                                parameter: "",
                                paragraphs: [
                                    {
                                        kind: "datablock",
                                        formatname: "four",
                                        parameter: "",
                                        paragraphs: [
                                            {
                                                kind: "datablock",
                                                formatname: "five",
                                                parameter: "",
                                                paragraphs: [
                                                    {
                                                        kind: "datablock",
                                                        formatname: "six",
                                                        parameter: "",
                                                        paragraphs: [
                                                            {
                                                                kind: "datablock",
                                                                formatname: "seven",
                                                                parameter: "",
                                                                paragraphs: [
                                                                    {
                                                                        kind: "datablock",
                                                                        formatname: "eight",
                                                                        parameter: "",
                                                                        paragraphs: [
                                                                            {
                                                                                kind: "datablock",
                                                                                formatname: "nine",
                                                                                parameter: "",
                                                                                paragraphs: [
                                                                                    {
                                                                                        kind: "datablock",
                                                                                        formatname: "ten",
                                                                                        parameter: "",
                                                                                        paragraphs: [
                                                                                            {
                                                                                                kind: "data",
                                                                                                lines: ["I know this looks weird, but this is still valid POD."],
                                                                                            },
                                                                                        ],
                                                                                    },
                                                                                ],
                                                                            },
                                                                        ],
                                                                    },
                                                                ],
                                                            },
                                                        ],
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ];

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: paragraphs,
                }
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    test("double-nested normal data block", () => {
        const fileContents = `\
=pod

=begin :foo

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

=begin :bar

Sed consequat, neque eu aliquam porttitor, tellus augue faucibus quam, a ornare neque dolor vitae dolor.

Pellentesque elementum luctus urna, et dapibus est faucibus eu.

=end :bar

Mauris ut arcu ipsum.

=end :foo

=cut
`;

        const paragraphs: Array<PodBlockContent> = [
            {
                kind: "normaldatablock",
                formatname: ":foo",
                parameter: "",
                paragraphs: [
                    {
                        kind: "ordinary",
                        lines: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit."],
                    },
                    {
                        kind: "normaldatablock",
                        formatname: ":bar",
                        parameter: "",
                        paragraphs: [
                            {
                                kind: "ordinary",
                                lines: ["Sed consequat, neque eu aliquam porttitor, tellus augue faucibus quam, a ornare neque dolor vitae dolor."],
                            },
                            {
                                kind: "ordinary",
                                lines: ["Pellentesque elementum luctus urna, et dapibus est faucibus eu."],
                            },
                        ],
                    },
                    {
                        kind: "ordinary",
                        lines: ["Mauris ut arcu ipsum."],
                    },
                ],
            },
        ];

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: paragraphs,
                }
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    test("deeply nested normal data block", () => {
        const fileContents = `\
=pod

=begin :one

=begin :two

=begin :three

=begin :four

=begin :five

=begin :six

=begin :seven

=begin :eight

=begin :nine

=begin :ten

I know this looks weird, but this is still valid POD.

=end :ten

=end :nine

=end :eight

=end :seven

=end :six

=end :five

=end :four

=end :three

=end :two

=end :one

=cut
`;

        const paragraphs: Array<PodBlockContent> = [
            {
                kind: "normaldatablock",
                formatname: ":one",
                parameter: "",
                paragraphs: [
                    {
                        kind: "normaldatablock",
                        formatname: ":two",
                        parameter: "",
                        paragraphs: [

                            {
                                kind: "normaldatablock",
                                formatname: ":three",
                                parameter: "",
                                paragraphs: [
                                    {
                                        kind: "normaldatablock",
                                        formatname: ":four",
                                        parameter: "",
                                        paragraphs: [
                                            {
                                                kind: "normaldatablock",
                                                formatname: ":five",
                                                parameter: "",
                                                paragraphs: [
                                                    {
                                                        kind: "normaldatablock",
                                                        formatname: ":six",
                                                        parameter: "",
                                                        paragraphs: [
                                                            {
                                                                kind: "normaldatablock",
                                                                formatname: ":seven",
                                                                parameter: "",
                                                                paragraphs: [
                                                                    {
                                                                        kind: "normaldatablock",
                                                                        formatname: ":eight",
                                                                        parameter: "",
                                                                        paragraphs: [
                                                                            {
                                                                                kind: "normaldatablock",
                                                                                formatname: ":nine",
                                                                                parameter: "",
                                                                                paragraphs: [
                                                                                    {
                                                                                        kind: "normaldatablock",
                                                                                        formatname: ":ten",
                                                                                        parameter: "",
                                                                                        paragraphs: [
                                                                                            {
                                                                                                kind: "ordinary",
                                                                                                lines: ["I know this looks weird, but this is still valid POD."],
                                                                                            },
                                                                                        ],
                                                                                    },
                                                                                ],
                                                                            },
                                                                        ],
                                                                    },
                                                                ],
                                                            },
                                                        ],
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
        ];

        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: paragraphs,
                }
            ],
        };

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });

    test("=for command without content", () => {
        const fileContents = `\
=pod

=for comment

=cut
`;
        const expected: PodDocument = {
            kind: "poddocument",
            blocks: [
                {
                    kind: "podblock",
                    paragraphs: [
                        {
                            kind: "datablock",
                            formatname: "comment",
                            parameter: "",
                            paragraphs: [],
                        },
                    ],
                },
            ],
        }; 

        const result = parser.parse(fileContents);

        expect(processor.process(result as RawPodDocument)).toMatchObject(expected);
    });
});

describe("pod to markdown conversion tests", () => {
    test("no pod block results in no markdown", () => {
        const fileContents = `\
# This isn't getting parsed.
sub foobar : prototype($) {
    my ($baz) = @_;

    return "baz: $baz";
}
`;
        const expected = "";

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("empty pod block results in no markdown", () => {
        const fileContents = `\
=pod

=cut
`;

        const expected = "";

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("ordinary paragraphs to markdown paragraphs", () => {
        const fileContents = `\
=pod

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

Integer purus nisi, egestas et imperdiet sit amet, interdum ut nisl.
Sed fringilla placerat nulla, et viverra purus ultricies sit amet.

Vestibulum vel diam venenatis, feugiat ipsum nec, aliquam erat. Maecenas dapibus
arcu odio, ac dictum mauris cursus quis. Donec facilisis ex at nisi dictum, ac
faucibus est elementum. Mauris sit amet pretium lacus. Nunc sollicitudin erat
mattis lectus dictum ultricies.

=cut
`;

        const expected = `\
Lorem ipsum dolor sit amet, consectetur adipiscing elit.

Integer purus nisi, egestas et imperdiet sit amet, interdum ut nisl.
Sed fringilla placerat nulla, et viverra purus ultricies sit amet.

Vestibulum vel diam venenatis, feugiat ipsum nec, aliquam erat. Maecenas dapibus
arcu odio, ac dictum mauris cursus quis. Donec facilisis ex at nisi dictum, ac
faucibus est elementum. Mauris sit amet pretium lacus. Nunc sollicitudin erat
mattis lectus dictum ultricies.
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("consecutive verbatim paragraphs to single markdown code block", () => {
        const fileContents = `\
=pod

    Lorem ipsum dolor sit amet, consectetur adipiscing elit.

    Integer purus nisi, egestas et imperdiet sit amet, interdum ut nisl.
Sed fringilla placerat nulla, et viverra purus ultricies sit amet.

    Vestibulum vel diam venenatis, feugiat ipsum nec, aliquam erat. Maecenas dapibus
arcu odio, ac dictum mauris cursus quis. Donec facilisis ex at nisi dictum, ac
faucibus est elementum. Mauris sit amet pretium lacus. Nunc sollicitudin erat
mattis lectus dictum ultricies.

=cut
`;

        const expected = `\
\`\`\`perl
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.

    Integer purus nisi, egestas et imperdiet sit amet, interdum ut nisl.
Sed fringilla placerat nulla, et viverra purus ultricies sit amet.

    Vestibulum vel diam venenatis, feugiat ipsum nec, aliquam erat. Maecenas dapibus
arcu odio, ac dictum mauris cursus quis. Donec facilisis ex at nisi dictum, ac
faucibus est elementum. Mauris sit amet pretium lacus. Nunc sollicitudin erat
mattis lectus dictum ultricies.
\`\`\`
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("consecutive verbatim paragraphs with indentation to single markdown block", () => {
        const fileContents = `\
=pod

    Lorem ipsum dolor sit amet, consectetur adipiscing elit.

    Integer purus nisi, egestas et imperdiet sit amet, interdum ut nisl.
    Sed fringilla placerat nulla, et viverra purus ultricies sit amet.

    Vestibulum vel diam venenatis, feugiat ipsum nec, aliquam erat. Maecenas dapibus
    arcu odio, ac dictum mauris cursus quis. Donec facilisis ex at nisi dictum, ac
    faucibus est elementum. Mauris sit amet pretium lacus. Nunc sollicitudin erat
    mattis lectus dictum ultricies.

=cut`;

        const expected = `\
\`\`\`perl
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.

    Integer purus nisi, egestas et imperdiet sit amet, interdum ut nisl.
    Sed fringilla placerat nulla, et viverra purus ultricies sit amet.

    Vestibulum vel diam venenatis, feugiat ipsum nec, aliquam erat. Maecenas dapibus
    arcu odio, ac dictum mauris cursus quis. Donec facilisis ex at nisi dictum, ac
    faucibus est elementum. Mauris sit amet pretium lacus. Nunc sollicitudin erat
    mattis lectus dictum ultricies.
\`\`\`
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("consecutive verbatim paragraphs with deep indentation to single markdown block", () => {
        const fileContents = `\
=pod

    async function getWorkspaceFoldersSafe(): Promise<WorkspaceFolder[]> {
        try {
            const workspaceFolders = await connection.workspace.getWorkspaceFolders();
            if (!workspaceFolders) {
                return [];
            } else {
                return workspaceFolders;
            }
        } catch (error) {
            return [];
        }
    }

    function sendDiags(params: PublishDiagnosticsParams): void {
        // Before sending new diagnostics, check if the file is still open.
        if (documents.get(params.uri)) {
            connection.sendDiagnostics(params);
        } else {
            connection.sendDiagnostics({ uri: params.uri, diagnostics: [] });
        }
    }

=cut`;

        const expected = `\
\`\`\`perl
    async function getWorkspaceFoldersSafe(): Promise<WorkspaceFolder[]> {
        try {
            const workspaceFolders = await connection.workspace.getWorkspaceFolders();
            if (!workspaceFolders) {
                return [];
            } else {
                return workspaceFolders;
            }
        } catch (error) {
            return [];
        }
    }

    function sendDiags(params: PublishDiagnosticsParams): void {
        // Before sending new diagnostics, check if the file is still open.
        if (documents.get(params.uri)) {
            connection.sendDiagnostics(params);
        } else {
            connection.sendDiagnostics({ uri: params.uri, diagnostics: [] });
        }
    }
\`\`\`
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("mixed verbatim and ordinary paragraphs", () => {
        const fileContents = `\
=pod

Lorem ipsum dolor sit amet:

    Consectetur adipiscing elit.

Integer purus nisi:

    Egestas et imperdiet sit amet, interdum ut nisl.

        Sed fringilla placerat nulla, et viverra purus ultricies sit amet.

Vestibulum vel diam venenatis.
Feugiat ipsum nec.

Aliquam erat:

    Maecenas dapibus arcu odio, ac dictum mauris cursus quis.

        Donec facilisis ex at nisi dictum, ac faucibus est elementum.

    Mauris sit amet pretium lacus. Nunc sollicitudin erat
    mattis lectus dictum ultricies.

=cut
`;

        const expected = `\
Lorem ipsum dolor sit amet:

\`\`\`perl
    Consectetur adipiscing elit.
\`\`\`

Integer purus nisi:

\`\`\`perl
    Egestas et imperdiet sit amet, interdum ut nisl.

        Sed fringilla placerat nulla, et viverra purus ultricies sit amet.
\`\`\`

Vestibulum vel diam venenatis.
Feugiat ipsum nec.

Aliquam erat:

\`\`\`perl
    Maecenas dapibus arcu odio, ac dictum mauris cursus quis.

        Donec facilisis ex at nisi dictum, ac faucibus est elementum.

    Mauris sit amet pretium lacus. Nunc sollicitudin erat
    mattis lectus dictum ultricies.
\`\`\`
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    // headers in markdown start at level 3, but do not exceed level 6
    test("pod headers to markdown headers", () => {
        const fileContents = `\
=pod

=head1 HEAD ONE

=head2 HEAD TWO

=head3 HEAD THREE

=head4 HEAD FOUR

=head5 HEAD FIVE

=head6 HEAD SIX

=head7 IGNORED HEADER, NOT CONVERTED :)

=cut
`;

        const expected = `\
### HEAD ONE

#### HEAD TWO

##### HEAD THREE

###### HEAD FOUR

###### HEAD FIVE

###### HEAD SIX
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });
});

// NOTE: POD doesn't allow many of the following list cases and places restrictions
// on which kinds of consecutive `=item` paragraphs are allowed, for example.
//
// We're being explicitly lax here and don't conform to the spec for simplicity's
// sake. Being 100% compliant isn't really necessary anyways, because this isn't
// supposed to be a full-fledged POD-to-$FORMAT converter; it should just be sufficient
// for displaying hover documentation.
//
// See `man perlpodspec` or this page for more information:
// https://perldoc.perl.org/perlpodspec#About-=over...=back-Regions
describe("pod lists to markdown lists", () => {
    const parser = new RawPodParser();
    const processor = new PodProcessor();
    const converter = new PodToMarkdownConverter();

    const podToMd = (fileContents: string): string => {
        let parseRes = parser.parse(fileContents);
        let processRes = processor.process(parseRes);

        return converter.convert(processRes);
    };

    // The POD spec doesn't really specify whether `=item` paragraphs are
    // allowed outside of `=over ... =back` blocks or not, so we'll just allow
    // them.
    test("freestanding pod list to markdown list", () => {
        const fileContents = `\
=pod

=head1 Unordered List

=item *

Foo.

=item

Bar.

=item *

Baz.

=head1 Ordered List

=item 1.

Foo.

=item 2.

Bar.

=item 3.

Baz.

=head1 Unordered List From Items With Text

=item Foo.

=item Bar.

=item Baz.

=cut`;

        const expected = `\
### Unordered List

- Foo.
- Bar.
- Baz.

### Ordered List

1. Foo.
2. Bar.
3. Baz.

### Unordered List From Items With Text

- Foo.
- Bar.
- Baz.
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("pod list in over block to indented markdown list", () => {
        const fileContents = `\
=pod

=head1 Nested Lists

=over

=item *

Foo.

=item

Bar.

=over

=item

Baz.

=item *

Qux.

=back

=back

=over

=item 1.

Foo.

=item 2.

Bar.

=over

=item 3.

Baz.

=item 4.

Qux.

=back

=back

=over

=item Foo.

=item Bar.

=over

=item Baz.

=item Qux.

=back

=back

=cut`;

        const expected = `\
### Nested Lists

- Foo.
- Bar.
    - Baz.
    - Qux.

1. Foo.
2. Bar.
    3. Baz.
    4. Qux.

- Foo.
- Bar.
    - Baz.
    - Qux.
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("nested lists with varying indentation levels", () => {
        const fileContents = `\
=pod

=over

=item * foo

=over 2

=item * bar

=over 3

=item * baz

=back

=back

=back


=over

=item 1. foo

=over 2

=item 2. bar

=over 3

=item 3. baz

=back

=back

=back

=cut
`;

        const expected = `\
- foo
  - bar
     - baz

1. foo
  2. bar
     3. baz
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("ordered pod lists to ordered markdown lists", () => {
        const fileContents = `\
=pod

=over 2

=item 1.

This list is ordered.

=item 2.

According to the spec, each ordered list must start at number 1.

=item 3.

... and also precede in order, without skipping a number.

=item 4

Everything's fine here. We may skip (forget) the dot.

=item 5.

Multiple
lines
are
    indented
correctly.

=back

=over 2

=item 42.

However, we avoid enforcing this ordering, because it makes things easier.

=item 666

We are beyond feeble ordering.

=item 100.

Beholden to none.

=back

=cut
`;

        const expected = `\
1. This list is ordered.
2. According to the spec, each ordered list must start at number 1.
3. ... and also precede in order, without skipping a number.
4. Everything's fine here. We may skip (forget) the dot.
5. Multiple
   lines
   are
       indented
   correctly.

42. However, we avoid enforcing this ordering, because it makes things easier.
666. We are beyond feeble ordering.
100. Beholden to none.
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("strange list items", () => {
        const fileContents = `\
=pod

The POD spec only allows certain command paragraphs to appear in an over-back block.

=over

=item

=over

But we can nest things, because it all handles the same anyways.

=back

=item

    Verbatim paragraphs
    are put into a neat
    code block in markdown
    though.

    That's fine and on spec.

    The code block even has indentation, oh my gosh.

=item

=item

The item above is empty. Shouldn't be possible, but we also allow it.

=item

Note: We don't allow headers though. That's on spec.

=over

=item

But it doesn't matter how deep you nest...

=item

=over

=item You can always do weird things that conformant POD doesn't allow.

=encoding utf-8

=item Encodings are ignored, for now.

=foobar foo
bar
baz

=item So are unknown command paragraphs.

=back

=back

=back

=cut`;

        const expected = `\
The POD spec only allows certain command paragraphs to appear in an over-back block.

-     But we can nest things, because it all handles the same anyways.
- \`\`\`perl
      Verbatim paragraphs
      are put into a neat
      code block in markdown
      though.

      That's fine and on spec.

      The code block even has indentation, oh my gosh.
  \`\`\`
-
- The item above is empty. Shouldn't be possible, but we also allow it.
- Note: We don't allow headers though. That's on spec.
    - But it doesn't matter how deep you nest...
    -     - You can always do weird things that conformant POD doesn't allow.
          - Encodings are ignored, for now.
          - So are unknown command paragraphs.
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("mixed list types to mixed markdown lists", () => {
        const fileContents = `\
=pod

=item Freestanding list items like this one aren't explicitly specified.

=item *

So we'll just allow them.

=item 42.

We're even throwing in an "ordered" list item here.

=cut



=pod

=over 2

=item This applies to over-back blocks as well, by the way.

=item 10.

We can do whatever we want, because conforming to the spec here would
be needlessly complex.

=item It's not like
markdown cares either.
(Does it actually, though?)

=back

=cut
`;

        const expected = `\
- Freestanding list items like this one aren't explicitly specified.
- So we'll just allow them.
42. We're even throwing in an "ordered" list item here.
- This applies to over-back blocks as well, by the way.
10. We can do whatever we want, because conforming to the spec here would
    be needlessly complex.
- It's not like
  markdown cares either.
  (Does it actually, though?)
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("single pod list items between paragraphs to markdown", () => {
        const fileContents = `\
=pod

There should be an empty line after this ordinary paragraph.

After this one as well.

=item This item is followed by an empty line.

Hello, I'm an ordinary paragraph, and I'm followed by an empty line.

Another one follows after this paragraph.

=head3 Let's interleave more!

=item *

Item followed by empty line.

Empty line after me.

=item Item followed by empty line.

Empty line after me.

=item 42.

Item followed by empty line.

Empty line after me, then EOF.

=cut
`;

        const expected = `\
There should be an empty line after this ordinary paragraph.

After this one as well.

- This item is followed by an empty line.

Hello, I'm an ordinary paragraph, and I'm followed by an empty line.

Another one follows after this paragraph.

##### Let's interleave more!

- Item followed by empty line.

Empty line after me.

- Item followed by empty line.

Empty line after me.

42. Item followed by empty line.

Empty line after me, then EOF.
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });
});

describe("pod data blocks to markdown", () => {
    test("single data block to markdown code block", () => {
        const fileContents = `\
=pod

=begin some-data ...with extra parameters that get ignored

Ordinary paragraphs...

    and verbatim paragraphs...

just get parsed and internally converted to "data paragraphs" (which is
what the spec calls them).



Multiple line breaks aren't preserved, though. Not sure if this matters,
but it makes things simpler.

=end some-data

=cut
`;

        const expected = `\
<!-- begin some-data -->
Ordinary paragraphs...

    and verbatim paragraphs...

just get parsed and internally converted to "data paragraphs" (which is
what the spec calls them).

Multiple line breaks aren't preserved, though. Not sure if this matters,
but it makes things simpler.
<!-- end some-data -->
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("HTML data block to markdown HTML code block", () => {
        const fileContents = `\
=pod

=begin html

<html>
    <head>
        <title>Hello World!</title>
    </head>
    <body>
        <h1>Hello World!</h1>
        <p>My purpose is to be a test case. Please free me.</p>
    </body>
</html>

=end html

=cut`;

        const expected = `\
\`\`\`html
<html>
    <head>
        <title>Hello World!</title>
    </head>
    <body>
        <h1>Hello World!</h1>
        <p>My purpose is to be a test case. Please free me.</p>
    </body>
</html>
\`\`\`
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("nested data blocks to nested markdown code blocks", () => {
        const fileContents = `\
=pod

=begin foo

Yeah, nesting is possible.

=begin bar

Because that's what the spec wants.

And because it wasn't that hard to implement.

=begin html

<html>
    <head></head>
    <body>
        <p>Even if...</p>
    </body>
</html>

=end html

...this looks really weird.

=begin html

<html>
    <head></head>
    <body>
        <p>And out of place.</p>
    </body>
</html>

=begin html

<html>
    <head></head>
    <body>
        <p>Like genuinely weird.</p>
    </body>
</html>

=end html

=end html

=end bar

But hey, we can handle it.

=end foo

=cut
`;

        const expected = `\
<!-- begin foo -->
Yeah, nesting is possible.
<!-- end foo -->
<!-- begin bar -->
Because that's what the spec wants.

And because it wasn't that hard to implement.
<!-- end bar -->
\`\`\`html
<html>
    <head></head>
    <body>
        <p>Even if...</p>
    </body>
</html>
\`\`\`
<!-- begin bar -->
...this looks really weird.
<!-- end bar -->
\`\`\`html
<html>
    <head></head>
    <body>
        <p>And out of place.</p>
    </body>
</html>
\`\`\`
\`\`\`html
<html>
    <head></head>
    <body>
        <p>Like genuinely weird.</p>
    </body>
</html>
\`\`\`
\`\`\`html
\`\`\`
<!-- begin bar -->
<!-- end bar -->
<!-- begin foo -->
But hey, we can handle it.
<!-- end foo -->
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("single normal data block to markdown", () => {
        const fileContents = `\
=pod

=begin :foo

This stuff in here gets treated as regular POD.

=head3 Including commands.

=over 3.5

=item Not gonna test this too thoroughly.

=item 42.

Because this isn't handled in any special manner.

=item

It really isn't.

=back

    So yeah. The block above doesn't exist in Markdown at all.

    You won't even know it's there.

=end :foo

=cut
`;

        const expected = `\
This stuff in here gets treated as regular POD.

##### Including commands.

- Not gonna test this too thoroughly.
42. Because this isn't handled in any special manner.
- It really isn't.

\`\`\`perl
    So yeah. The block above doesn't exist in Markdown at all.

    You won't even know it's there.
\`\`\`
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("nested normal data blocks to markdown", () => {
        const fileContents = `\
=pod

=begin :foo

=head1 Foo.

=begin :bar

=head2 Bar.

Lorem ipsum dolor sit amet.

=end :bar

Consectetur adipiscing elit.

=end :foo

=cut
`;

        const expected = `\
### Foo.

#### Bar.

Lorem ipsum dolor sit amet.

Consectetur adipiscing elit.
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("nested mixed data blocks to markdown", () => {
        const fileContents = `\
=pod

=begin data

This is where things get interesting.

=begin html

<p>Because the spec allows nesting data paragraphs ... </p>

=begin :no-data-here-lolz

... with non-data data paragraphs.

=head1 So it's possible to put headers in here, for example.

=begin inner-data

Also, you can add more begin-end blocks deeper inside all of this.

Surprisingly, this wasn't too hard to support.

=end inner-data

=end :no-data-here-lolz

<p>And then you can just continue with your HTML or something.</p>

=end html

It's... odd, to say the least.

=end data

=cut
`;

        const expected = `\
<!-- begin data -->
This is where things get interesting.
<!-- end data -->
\`\`\`html
<p>Because the spec allows nesting data paragraphs ... </p>
\`\`\`
... with non-data data paragraphs.

### So it's possible to put headers in here, for example.

<!-- begin inner-data -->
Also, you can add more begin-end blocks deeper inside all of this.

Surprisingly, this wasn't too hard to support.
<!-- end inner-data -->
\`\`\`html
<p>And then you can just continue with your HTML or something.</p>
\`\`\`
<!-- begin data -->
It's... odd, to say the least.
<!-- end data -->
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });
});

describe("markdown inline formatting", () => {
    test("pod bold to markdown bold", () => {
        const fileContents = `\
=pod

=head1 B<Bold header.>

B<< This paragraph is in bold. >>

    B<This verbatim one gets ignored.>

=item B<<< This item is in bold.    >>> But not here. B<< Here we go again. >>

=item *

B<So is this one.> B<Twice.> B<Thrice.>

=item 42.

And B<<<<<     this >>>>> one too.

=cut
`;

        const expected = `\
### **Bold header.**

**This paragraph is in bold.**

\`\`\`perl
    B<This verbatim one gets ignored.>
\`\`\`

- **This item is in bold.** But not here. **Here we go again.**
- **So is this one.** **Twice.** **Thrice.**
42. And **this** one too.
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("pod italics to markdown bold", () => {
        const fileContents = `\
=pod

=head1 I<Header in italics.>

I<< This paragraph is in italics. >>

    I<This verbatim one gets ignored.>

=item I<<< This item is in italics.    >>> But not here. I<< Here we go again. >>

=item *

I<So is this one.> I<Twice.> I<Thrice.>

=item 42.

And I<<<<<     this >>>>> one too.

=cut
`;

        const expected = `\
### *Header in italics.*

*This paragraph is in italics.*

\`\`\`perl
    I<This verbatim one gets ignored.>
\`\`\`

- *This item is in italics.* But not here. *Here we go again.*
- *So is this one.* *Twice.* *Thrice.*
42. And *this* one too.
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("pod bold italics to markdown bold", () => {
        const fileContents = `\
=pod

=head1 I<B<Header in bold italics.>> B<I<In two different ways.>>

I<<  B<<      This paragraph is in bold italics. >> >>

    B<I<This verbatim one gets ignored.>>

=item B<< I<<<    This item is in bold italics.       >>> >> But not here. B<< I<< Here it is again. >> >>

=item *

B<I<< So is this one. >>> Not here. B<I<< And we're back. >>>

=item 42.

And I<B<< this >>> one too.

=cut
`;

        const expected = `\
### ***Header in bold italics.*** ***In two different ways.***

***This paragraph is in bold italics.***

\`\`\`perl
    B<I<This verbatim one gets ignored.>>
\`\`\`

- ***This item is in bold italics.*** But not here. ***Here it is again.***
- ***So is this one.*** Not here. ***And we're back.***
42. And ***this*** one too.
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });

    test("pod inline code to markdown inline code", () => {
        const fileContents = `\
=pod

=head1 C<Headers allow inline code.> Doesn't matter C<where>.

C<< This paragraph is inline code. >>

    C<This verbatim paragraph gets ignored.>

=item C<<<     This item is inline code.     >>>

=item *

C<So is this one.> But not here. C<Here it's code again.>

=item 42.

C<Same goes for this one.> C<Twice.> C<Thrice.>

=cut
`;

        const expected = `\
### \`Headers allow inline code.\` Doesn't matter \`where\`.

\`This paragraph is inline code.\`

\`\`\`perl
    C<This verbatim paragraph gets ignored.>
\`\`\`

- \`This item is inline code.\`
- \`So is this one.\` But not here. \`Here it's code again.\`
42. \`Same goes for this one.\` \`Twice.\` \`Thrice.\`
`;

        const result = podToMd(fileContents);

        expect(result).toEqual(expected);
    });
});
