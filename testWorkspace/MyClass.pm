package MyClass;
use strict;
use warnings;

sub new {
    my $class = shift;
    print "In MyClass->new()\n";
    return bless {}, $class;
}

sub myobj_method {
    print "In myobj_method\n";
}

sub duplicate_method_name {
    print "In MyObject duplicate_name\n";
}

1;