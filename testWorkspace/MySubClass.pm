package MySubClass;
use strict;
use warnings;
use base qw(MyClass);


sub new {
    my $class = shift;
    print "In MySubClass->new()\n";
    my $self = $class->SUPER::new();
    return bless {}, $class;
}


1;