#!perl

use strict;
use warnings;

use Try::Tiny qw( catch try );

if ( !eval { require App::perlimports::CLI; 1 } ) {
    print "\nUnable to run perlimports as it is not installed\n";
    exit(0);
}

my $min = 0.000049;
if ( $App::perlimports::VERSION < $min ) {
    printf( "\nNeed at least version %f of perlimports\n", $min);
    exit(0);
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
