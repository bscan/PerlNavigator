package lib_bs22::SourceStash;
use strict;
use Filter::Simple;

our $source = '';
our $filename;

FILTER { $source .= $_ };

1;

=head1 NAME
SourceStash.pm

=head1 SYNOPSIS
I don't love this module, but it performs a needed task.
The Perl Navigator is passing Perl source code directly into perl via stdin for compilation, and I would like to inspect that code later in the same process.
When loaded, this simply stores the source in the variable $lib_bs22::SourceStash::source

If you have an actual saved file with the source, you don't need this module.

If any Perl Gurus are reading this and have a better way to access the source of a program run through STDIN, please let me know. Thanks!