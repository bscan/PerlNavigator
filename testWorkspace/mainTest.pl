use strict;
use warnings;
use FindBin qw($Bin);
use File::Spec;
use lib "$Bin";
use experimental 'signatures';

# These are system test modules
use Data::Dumper;                    # Module details. Dumper is auto-exported
use Cwd qw(fast_abs_path);           # fast_abs_path is pure perl.
use MIME::Base64 qw(encode_base64);  # encode_base64 is XS, so the best we can do is find the .pm

# Workspace modules
use Dir::NamedPackage qw(exported_sub imported_constant $our_variable);
use MyClass;
use MySubClass;
use MyOtherClass;
use NonPackage;
use MooClass;
use MooseClass;


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

print imported_constant . "\n";

print $our_variable . "\n";

sub same_script_sub {
    my $foo6 = shift;
    print "$foo6\n";
}

sub sub_with_sig($subParam1, @subParam2){
    print "in sub_with_sig($subParam1, @subParam2)\n"
}

print "\n------ Subs --------\n";
same_script_sub("FooSix");
SameFilePackage::same_file_package_sub();
sub_with_sig(2,3,4);
duplicate_sub_name();
nonpackage_sub();
exported_sub();
Dir::NamedPackage::non_exported_sub();
Dir::NamedPackage::duplicate_sub_name();

print Dumper(\%my_hash);
print fast_abs_path($0) . "\n";
print encode_base64($0) . "\n";


print "\n ------ Methods and Attributes ------\n";

my $testObj = MyClass->new();
$testObj->myobj_method();

my $subObj = MySubClass->new();
$subObj->myobj_method();

my $testObj2 = MyOtherClass->new();
$testObj2->unique_method_name();
$testObj2->duplicate_method_name();

my $mooObj = MooClass->new();
$mooObj->moo_sub();
print $mooObj->moo_attrib . "\n";

my $mooseObj = MooseClass->new();
$mooseObj->moose_sub();

for (my $cStyleLoopVar = 0; $cStyleLoopVar <= 2; $cStyleLoopVar++){
    print "$cStyleLoopVar";
}



print "\nDone\n";

package SameFilePackage;

sub same_file_package_sub {
    print "In same_file_package_sub\n";
}

 