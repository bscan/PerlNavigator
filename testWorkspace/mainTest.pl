use strict;
use warnings;
use Data::Dumper;                   # Module details. Dumper is auto-exported
use Cwd qw(abs_path fast_abs_path); # abs_path is an XS function exported on request. fast_abs_path is pure perl.
use FindBin qw($Bin);
use File::Spec;
use lib "$Bin";
use Dir::NamedPackage qw(exported_sub);
use MyObject;
use MyObject2;
use NonPackage;
use experimental 'signatures';

# TODO: Add simple Exporter module

use constant MYCONSTANT => 5;

my $my_scalar = 1;
my @my_array = (2,2);
my $array_ref = [3,3];
my %my_hash = ("Four"=>4);
my $hash_ref = {"Five"=>5};

print "\n------ Variables --------\n";
print $my_scalar;
print ${my_scalar};

print $my_array[0];
print "@my_array";
print $array_ref->[0];
print "@$array_ref";
print $my_hash{"Four"};
print %my_hash;
print $hash_ref->{"Five"};

print MYCONSTANT;

LABEL1: for (0..4) {
    LABEL2: foreach my $lexLoopDuplicate (0..4) {
        next LABEL2 if $lexLoopDuplicate > 2;
        last LABEL1;
    }
}

foreach my $lexLoopDuplicate (1..3){
    print $lexLoopDuplicate;
}

sub same_script_sub {
    my $foo6 = shift;
    print "$foo6\n";
}

sub sub_with_sig($subParam1, @subParam2){
    print $subParam1;
    print @subParam2;
}

print "\n------ Subs --------\n";
same_script_sub("FooSix");
sub_with_sig(2,3,4);
duplicate_sub_name();
nonpackage_sub();
exported_sub();
Dir::NamedPackage::non_exported_sub();
Dir::NamedPackage::duplicate_sub_name();

print Dumper(\%my_hash);
print fast_abs_path($0) . "\n";
print abs_path($0) . "\n";


print "\n ------ Methods ------\n";

my $testObj = MyObject->new();
$testObj->myobj_method();

my $testObj2 = MyObject2->new();
$testObj2->duplicate_method_name();

