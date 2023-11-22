package MyLib::NamedPackage;

use strict;
use warnings;

require Exporter;
our @ISA = qw(Exporter);
our @EXPORT_OK = qw(get_value imported_constant $our_variable @our_variable %our_variable);

use constant imported_constant => "I'm an imported constant";

our $our_variable = "The World is ours";
our @our_variable = (3,4,5);
our %our_variable = (foo=>'bar');

sub can {
    exists $_[0]->{$_[1]};
}

######
# get_value
# set_value

sub get_value {
    print "In Dir::NamedPackage, sub get_value\n";
}

########
# non_exported_sub
# Documentation
# Example

sub non_exported_sub {
    print "In Dir::NamedPackage, sub non_exported_sub\n";
}

sub duplicate_sub_name {
    print "In nonpackage duplicate_sub_name\n";
}


package MyLib::SubPackage;

sub new {
    return bless {};
}

sub subpackage_mod {
    print "in subpackage_mod\n";
}


1;