use strict;
use warnings;
use ExtUtils::Installed;
use Data::Dumper;
use ExtUtils::Installed;
use Module::CoreList;
# my ($inst) = ExtUtils::Installed->new();
# my (@modules) = $inst->modules();
# print "@modules\n";
my $installed = ExtUtils::Installed->new();
my @foo = Module::CoreList->find_modules();
# foreach my $mod ($mods->modules()){
#     print $mod . "\n";
# }

print Dumper(\@foo);

# #my $installed = ExtUtils::Installed->new(inc_override => $include);

# foreach my $module ($installed->modules)
# {
#     my @files = $installed->files($module, 'prog');
#     $module =~ s/::/\//g;

#     # Find all the packages that are part of this module
#     foreach my $file (@files)
#     {
#         print "LOoking at $file\n";
#         my ($path) = $file =~ /(\Q$module\E(?:\/.+)?)\.pm$/;
#         next unless (length $path);
#         my $mod_package = $path =~ s/\//::/gr;
#         print "$mod_package\n";
#         #push @ext_modules, $mod_package;
#     } ## end foreach my $file (@files)
#     last;
# } ## end foreach my $module ($installed...)
