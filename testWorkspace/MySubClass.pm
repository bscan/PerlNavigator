package MySubClass;
use strict;
use warnings;
use FindBin qw($Bin);
use lib "$Bin";
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
    print "In overridden_method from MySubClass\n";
}


1;