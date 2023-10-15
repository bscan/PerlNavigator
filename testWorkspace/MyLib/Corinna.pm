use v5.38;
use experimental 'class';
class MyLib::Corinna;

field $x :param = 0;
field $y :param = 0;

method move ($dX, $dY) {
   $x += $dX;
   $y += $dY;
}


method describe () {  
   print "A point at ($x, $y)\n";
}

1;
