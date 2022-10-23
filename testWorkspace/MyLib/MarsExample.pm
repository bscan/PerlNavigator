package MyLib::MarsExample;

use v5.26;
use warnings;
use Mars::Class;

attr 'foo';
attr 'bar';

sub marsMethod {
    print "in marsMethod\n";
}

1;
