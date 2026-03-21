use strict;
use warnings;
use Capture::Tiny qw( capture );
use File::Spec;
use Test::More import => [qw( done_testing is ok like )];

# Prevent Inquisitor's CHECK block from running during test load.
BEGIN { $ENV{'PERLNAVIGATORTEST'} = 1; }

use FindBin qw( $Bin );
use lib "$Bin/../server/src/perl";
use Inquisitor ();

# Regression test: Inquisitor stubs out namespace::clean to prevent it from
# wiping the symbol table. The stub previously only provided import() and
# VERSION, omitting get_functions() and clean_subroutines(). Any module that
# calls namespace::clean->get_functions($package) at file scope would fail with:
#
#   Can't locate object method "get_functions" via package "namespace::clean"
#
# This caused a cascade of false "Syntax" diagnostics in the editor.

my $testFile = File::Spec->rel2abs("$Bin/../testWorkspace/MyLib/NamespaceCleanCaller.pm");

# Verify get_functions stub exists and is callable.
ok( namespace::clean->can('get_functions'),
    'namespace::clean stub provides get_functions method' );

ok( namespace::clean->can('clean_subroutines'),
    'namespace::clean stub provides clean_subroutines method' );

# Verify get_functions returns a hashref (not undef or an exception).
my $funcs;
eval { $funcs = namespace::clean->get_functions('main') };
is( $@, '', 'namespace::clean->get_functions does not throw' );
ok( ref($funcs) eq 'HASH', 'namespace::clean->get_functions returns a hashref' );

# Verify that Inquisitor::run() succeeds on a file that calls
# namespace::clean->get_functions at file scope.
my $output;
eval { $output = capture(sub { Inquisitor::run($testFile) }) };
is( $@, '', 'Inquisitor::run does not die on file using namespace::clean->get_functions' );

# The file should produce symbol output (my_method should appear).
like( $output, qr/my_method/, 'Symbol from NamespaceCleanCaller.pm is found' );

done_testing;
