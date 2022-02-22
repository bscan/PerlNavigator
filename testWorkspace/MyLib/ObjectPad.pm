use v5.26;
use Object::Pad;
package MyLib::ObjectPad;
class MyLib::ObjectPad;

has $x :param = 0;
has $y :param = 0;

method move ($dX, $dY) {
   $x += $dX;
   $y += $dY;
}

method describe () {
   print "A point at ($x, $y)\n";
}

1;
