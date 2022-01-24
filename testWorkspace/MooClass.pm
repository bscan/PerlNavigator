package MooClass;
use Moo;
use strictures 2;
use namespace::clean;
 
sub moo_sub {
  my $self = shift;
  print "In my moo sub with " . $self->moo_attrib . "\n";
}
 

has moo_attrib => (
  is => 'ro',
  default => 'Example moo attribute'
);
 

1;