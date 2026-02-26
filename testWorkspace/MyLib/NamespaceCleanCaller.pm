package MyLib::NamespaceCleanCaller;

# This module simulates a pattern where namespace::clean->get_functions()
# is called at file scope (not inside a BEGIN block). This is legal Perl
# and works at runtime, but was broken under Inquisitor because the
# namespace::clean stub only provided import(), not get_functions().

use strict;
use warnings;
use namespace::clean;

# Call get_functions at file scope, the way some type-library frameworks do.
my $functions = namespace::clean->get_functions(__PACKAGE__);

sub my_method { return 42 }

1;
