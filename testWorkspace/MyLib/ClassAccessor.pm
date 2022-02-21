package MyLib::ClassAccessor;
 ## no critic (strict)
use base qw(Class::Accessor);
MyLib::ClassAccessor->follow_best_practice;
MyLib::ClassAccessor->mk_accessors(qw(name role salary));
 
# or if you prefer a Moose-like interface...


package MyLib::ClassAccessorAntlers;
use Class::Accessor "antlers";
has name => ( is => "rw", isa => "Str" );
has role => ( is => "rw", isa => "Str" );
has salary => ( is => "rw", isa => "Num" );
 

1;