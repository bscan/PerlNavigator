package MyLib::MyClass;
use strict;
use warnings;
use Data::Dumper qw(Dumper);
use experimental 'signatures';
use namespace::autoclean;
use namespace::clean;


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


=head1 NAME

MyClass: Example documentation
=head1 SYNOPSIS

	use MyClass;

=cut 



sub duplicate_method_name {
    print "In MyObject duplicate_name\n";
}


*dynamic = sub { print "Dynamic\n" };

my $genWarning;
my $genWarning;

1;


=item duplicate_method_name

duplicate_method_name prints some information