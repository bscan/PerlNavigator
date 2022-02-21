package MyLib::ClassTiny;
use strict;
use warnings;

use Class::Tiny qw( ssn ), {
  timestamp => sub { time }   # attribute with default
};
 
1;

1;