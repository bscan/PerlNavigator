# mainTest.pl uses a variety of non-core things (e.g. Moo/Moose) as well as recent Perl Constructs (e.g. signatures)
# slimTest.pl is for testing with a barebones Perl 5.8

use strict;
use warnings;
use utf8;
use FindBin qw($Bin);
use File::Spec;
use lib "$Bin";
# These are system test modules
use Data::Dumper;                    # Module details. Dumper is auto-exported
use Cwd qw(fast_abs_path);           # fast_abs_path is pure perl.
use MIME::Base64 qw(encode_base64);  # encode_base64 is XS, so the best we can do is find the .pm

# Workspace modules
use MyLib::NamedPackage qw(exported_sub imported_constant $our_variable);
use MyLib::MyClass;
use MyLib::MyOtherClass;
use MyLib::NonPackage;
use MyLib::DBI;
use MySubClass;

use constant MYCONSTANT => 6;

my $my_scalar = 1;
my @my_array = (2,2);
my $array_ref = [3,3];
my %my_hash = ("Four"=>4);
my $hash_ref = {"Five"=>5};
my $üτfⅷ = 8;
my $üτfⅷ = 9; # 2nd declaration to test warnings.

print "\n------ Variables --------\n";
print $my_scalar;
print ${my_scalar};

print $my_array[0];
print "@my_array";
print $array_ref->[0];
print $$array_ref[0];
print "@$array_ref";
print $my_hash{"Four"};
print %my_hash;
print $hash_ref->{"Five"};
print $$hash_ref{"Five"};
print $üτfⅷ;

{
    # Run this on severity 3 to see the butchered utf-8 name via Variables::ProhibitReusedNames. It does work though
    my $üτfⅷ = 2;
}

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

for (my $cStyleLoopVar = 0; $cStyleLoopVar <= 2; $cStyleLoopVar++){
    print "$cStyleLoopVar";
}

print imported_constant . "\n";

print $our_variable . "\n";

sub same_script_sub {
    my $functionVar = shift;
    print "$functionVar\n";
}


print "\n------ Subs --------\n";
same_script_sub("FooSix");
SameFilePackage::same_file_package_sub();
duplicate_sub_name();
nonpackage_sub();
exported_sub();
MyLib::NamedPackage::non_exported_sub();
MyLib::NamedPackage::duplicate_sub_name();
MyLib::SubPackage::subpackage_mod();

print Dumper(\%my_hash);
print fast_abs_path($0) . "\n";
print encode_base64($0) . "\n";

print "\n ------ Methods and Attributes ------\n";

my $testObj = MyLib::MyClass->new();
$testObj->overridden_method();

my $subObj = MySubClass->new();
$subObj->overridden_method();
$subObj->inherited_method();

my $otherObj = MyLib::MyOtherClass->new();
$otherObj->unique_method_name();
$otherObj->duplicate_method_name();

my $unknownObj = $otherObj;
$unknownObj->duplicate_method_name();

my $hiddenPackObj = MyLib::SubPackage->new();

my $dbh2 = MyLib::DBI->connect();


print "\nDone with test script\n";

package SameFilePackage; ## no critic (package)

sub same_file_package_sub {
    print "In same_file_package_sub\n";
}
