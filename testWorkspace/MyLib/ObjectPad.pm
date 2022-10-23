package MyLib::ObjectPad;

use v5.26;
use Object::Pad;
class MyLib::ObjectPad;

has $x :param = 0;
has $y :param = 0;
has @foo;
has %bar;

field $mutatorField: mutator;
field $writerField: writer;

my $qux = 10;

method move ($dX, $dY) {
   $x += $dX;
   $y += $dY;
}

method $frob {
   print "I'm a private method\n";
}

method describe () {
   print "A point at ($x, $y)\n";
}

1;
