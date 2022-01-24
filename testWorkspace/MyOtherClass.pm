package MyOtherClass;
use strict;
use warnings;

sub new {
    my $class = shift;
    return bless {}, $class;
}

sub duplicate_method_name {
    print "In MyObject2 with duplicate_name\n";
}

1;