use strict;
use warnings;
use PPI; 
use Perl::Critic;
use Getopt::Long;

my ($file, $profile);
GetOptions ("file=s"    => \$file,
            "profile=s" => \$profile);


my $sSource = do { local $/; <STDIN> };
die("Did not pass any source via stdin") if !defined($sSource);
die("Critic profile not readable") if ($profile and !-f $profile); # Profie may be undef
# Do not check for readability of the file since we never actually read it. Only checking the name for policy violations.

print "Analyzing $file\n";
my $doc = PPI::Document->new( \$sSource);

$doc->{filename} = $file;

my $critic = Perl::Critic->new( -profile => $profile);
Perl::Critic::Violation::set_format("%s~|~%l~|~%c~|~%m~|~%p~||~");

my @violations = $critic->critique($doc);

print "Perl Critic violations:\n";
foreach my $viol (@violations){
    print "$viol\n";
}


