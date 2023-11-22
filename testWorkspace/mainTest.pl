use strict;
use warnings;
use utf8;
use FindBin qw($Bin);
use File::Spec;
use lib "$Bin";
use experimental 'signatures';
# These are system test modules
use Data::Dumper qw(Dumper);                    # Module details. Dumper is auto-exported
use Cwd qw(fast_abs_path);           # fast_abs_path is pure perl.
use MIME::Base64 qw(encode_base64);  # encode_base64 is XS, so the best we can do is find the .pm
use File::Copy;
# Workspace modules
use MyLib::NamedPackage qw(get_value imported_constant $our_variable @our_variable %our_variable);
use MyLib::MyClass;
use MyLib::MyOtherClass;
use MyLib::NonPackage;
use MyLib::MooseClass;
use MyLib::MooClass;
use MyLib::DBI;
use MyLib::ObjectPad;
use MyLib::ClassAccessor;
use MyLib::ClassTiny;
use MyLib::ObjectTiny;
use MyLib::MarsExample;
use MyLib::Corinna;

use MySubClass;

use constant MYCONSTANT => 6;

my $autoComplete = ' $my ';

my $my_scalar = 1;
my @my_array = (2,2);
my $array_ref = [3,3];
my %my_hash = ("Four"=>4);
my $hash_ref = {"Five"=>5};
# my $üτfⅷ = 10;

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
# print $üτfⅷ;

print MYCONSTANT;

INIT {
    print "Init blocks"
}

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

sub sub_with_sig($subParam1, @subParam2){ ## no critic (prototypes)
    print "in sub_with_sig($subParam1, @subParam2)\n"
}


print "\n------ Subs --------\n";
same_script_sub("FooSix");
SameFilePackage::same_file_package_sub();
sub_with_sig(2,3,4);
duplicate_sub_name();
nonpackage_sub();
get_value();
MyLib::NamedPackage::non_exported_sub();
MyLib::NamedPackage::duplicate_sub_name();
MyLib::SubPackage::subpackage_mod();

print Dumper(\%my_hash);
print fast_abs_path($0) . "\n";
print encode_base64($0) . "\n";


print "\n ------ Methods and Attributes ------\n";


my $testObj = MyLib::MyClass->new();
$testObj->overridden_method();
$testObj->dynamic();

my $subObj = MySubClass->new();
$subObj->overridden_method();
$subObj->inherited_method(2,3);

my $otherObj = MyLib::MyOtherClass->new();
$otherObj->unique_method_name();
$otherObj->duplicate_method_name();

my $unknownObj = $otherObj; # Type hints: $unknownObj isa MyLib::MyOtherClass
$unknownObj->duplicate_method_name();

MyLib::MyOtherClass->new($my_scalar)->duplicate_method_name();
MyLib::MyOtherClass->new->duplicate_method_name();

my $mooObj = MyLib::MooClass->new();
$mooObj->moo_sub();
print $mooObj->moo_attrib . "\n";

my $mooseObj = MyLib::MooseClass->new();
$mooseObj->moose_sub();
$mooseObj->moose_attrib; # Better hover than the moo_attrib

my $nonObject = MyLib::MooseClass->new()->moose_sub();

my $hiddenPackObj = MyLib::SubPackage->new();

my $dbh2 = MyLib::DBI->connect();

my $padObj = MyLib::ObjectPad->new(x => 5, y => 10);
$padObj->describe();
$padObj->mutatorField = 10;
$padObj->set_writerField(20);
print($padObj->mutatorField);


my $caObj = MyLib::ClassAccessor->new();
my $caaObj = MyLib::ClassAccessorAntlers->new();

my $ctObj = MyLib::ClassTiny->new();

my $otObj = MyLib::ObjectTiny->new();

my $marsObj = MyLib::MarsExample->new(foo=>10);
print $marsObj->foo(20);
print $marsObj->foo;

my $corinna = MyLib::Corinna->new();
$corinna->move(2,3);


use attributes ();
print "ObjectPad attributes: " . attributes::get(\&MyLib::ObjectPad::describe) . "\n";

print "\nDone with test script\n";

package SameFilePackage; ## no critic (package)

sub forward_declaration;

sub same_file_package_sub {
    print "In same_file_package_sub\n";
}

package ParseTest {
    my $foo ;        # Unmatched }
    $foo = "
    Quoted multiline }
    ";      
    $foo =~ s/\}//g; # Regexed }
    
    sub ParseSubTest {

    }

}

package Foo {
    use Moo;
    has generic_attrib => (is => 'ro');
    
    sub baz {
        my $self = shift;
    }
}

