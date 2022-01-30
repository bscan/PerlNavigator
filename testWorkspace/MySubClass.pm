package MySubClass;
use strict;
use warnings;
use MyLib::MyClass;
use base qw(MyLib::MyClass);
use Data::Dumper qw(Dumper);
use MyLib::NonPackage;

sub new {
    my $class = shift;
    print "In MySubClass->new()\n";
    my $self = $class->SUPER::new();
    return bless {}, $class;
}


sub overridden_method {
    my $self = shift;
    print "In orverridden_method from MySubClass\n";
}


1;