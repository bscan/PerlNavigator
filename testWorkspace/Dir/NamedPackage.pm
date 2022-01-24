package Dir::NamedPackage;

use strict;
use warnings;

require Exporter;
our @ISA = qw(Exporter);
our @EXPORT_OK = qw(exported_sub imported_constant $our_variable);

use constant imported_constant => "I'm an imported constant";

our $our_variable = "The World is ours";

sub exported_sub {
    print "In Dir::NamedPackage, sub exported_sub\n";
}

sub non_exported_sub {
    print "In Dir::NamedPackage, sub non_exported_sub\n";
}

sub duplicate_sub_name {
    print "In nonpackage duplicate_sub_name\n";
}

1;