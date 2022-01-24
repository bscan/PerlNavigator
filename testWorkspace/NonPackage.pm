use strict;
use warnings;

sub nonpackage_sub {
    print "Non-package\n";
}

sub duplicate_sub_name {
    print "In nonpackage duplicate_name\n";
}

1;