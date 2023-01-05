package MyLib::syntaxTests;
use strict;
use warnings;

#use feature ":5.10";
use v5.30;
use Try::Tiny;
use Object::Pad;

state $bar;
class Foo {

}

try {

} catch {
    # do something
} finally {
    # do something
};

print $bar;


1;