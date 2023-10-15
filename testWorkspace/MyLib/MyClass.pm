package MyLib::MyClass;
use strict;
use warnings;
use Data::Dumper qw(Dumper);
use experimental 'signatures';

sub new {
    my $class = shift;
    print "In MyClass->new()\n";
    return bless {}, $class;
}

sub overridden_method {
    my $self = shift;
    print "In overridden_method from MyClass\n";
}

sub inherited_method($self, $foo, $bar) {
    print "In inherited_method\n";
}

sub duplicate_method_name {
    print "In MyObject duplicate_name\n";
}


*dynamic = sub { print "Dynamic\n" };

my $genWarning;
my $genWarning;

1;