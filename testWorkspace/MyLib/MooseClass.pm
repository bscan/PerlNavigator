package MyLib::MooseClass;
# Simple example taken from the Moose synopsis. 
use Moose; # automatically turns on strict and warnings
 
has 'moose_attrib' => (
    is => 'rw', 
    default => 'Moost attr'
);
 
sub BUILD {
    print "In moose build\n";
}

sub moose_sub {
    my $self = shift;
    print "In my moose sub\n";
}
 

1;