#!perl

use strict;
use warnings;

use Try::Tiny qw( catch try );

sub clear_stdin_and_exit {
    # Unclear if this is needed, but I've had issues on some versions of MacOS where STDIN needs to be cleared to function properly
    my $sSource = do { local $/; <STDIN> };
    exit(1);
}

if ( !eval { require App::perlimports::CLI; 1 } ) {
    print "\nUnable to run perlimports as it is not installed\n";
    clear_stdin_and_exit();
}

my $min = 0.000049;
if ( $App::perlimports::VERSION < $min ) {
    printf( "\nNeed at least version %f of perlimports\n", $min);
    clear_stdin_and_exit();
};

my @args = @ARGV;

push @args, '--read-stdin';

local @ARGV = @args;

my $exit_code = 0;
try {
    $exit_code = App::perlimports::CLI->new->run;
}
catch {
    print STDERR $_;
    $exit_code = 1;
};

exit($exit_code);
