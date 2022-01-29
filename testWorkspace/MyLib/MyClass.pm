package MyLib::MyClass;
use strict;
use warnings;
use Data::Dumper qw(Dumper);

sub new {
    my $class = shift;
    print "In MyClass->new()\n";
    return bless {}, $class;
}

sub overridden_method {
    my $self = shift;
    print "In orverridden_method from MyClass\n";
}

sub inherited_method {
    print "In inherited_method\n";
}

sub duplicate_method_name {
    print "In MyObject duplicate_name\n";
}

1;