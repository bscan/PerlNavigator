package MyOtherClass;
use strict;
use warnings;

sub new {
    my $class = shift;
    return bless {}, $class;
}

sub unique_method_name {
    print "In unique_method_name\n";
}

sub duplicate_method_name {
    print "In MyObject2 with duplicate_name\n";
}

1;