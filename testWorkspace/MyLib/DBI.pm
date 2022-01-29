package MyLib::DBI;
use strict;
use warnings;

# DBI is a common and important module and it's behaviour is explictly accounted for in the Navigator

sub connect {
    my $self = shift;
    print "A special sub for DBI::connect \n";
    return MyLib::DBI::db->new();
}


package MyLib::DBI::db;

sub new {
    my $class = shift;
    return bless {}, $class;
}

sub selectall_array {
    print "I'm in selectall_array"
}
  
sub _private_method {
    print "I'm in selectall_array"
}

sub ALLCAPS_METHOD {
    print "I'm in selectall_array"
}

1;