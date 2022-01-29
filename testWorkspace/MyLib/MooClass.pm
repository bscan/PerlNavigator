package MyLib::MooClass;
use Moo;
use Data::Dumper qw(Dumper);
 
sub moo_sub {
    my $self = shift;
    print "In my moo sub with " . $self->moo_attrib . "\n";
}
  
sub BUILD {
    print "In my MOO Build sub\n";
}

has moo_attrib => (
  is => 'ro',
  default => 'Example moo attribute'
);
 

1;