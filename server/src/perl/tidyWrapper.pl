use strict;
use warnings;
use Getopt::Long;
use utf8;
use Unicode::Normalize qw(NFKD);
use open qw(:std :utf8);

if ( !eval{ require Perl::Tidy; 1} ){
    print "\nUnable to run Perl::Tidy as it is not installed\n";
    exit(0);
}

my ($file, $profile);
GetOptions ("profile=s" => \$profile);

my $source = do { local $/; <STDIN> };
die("Did not pass any source via stdin") if !defined($source);
die("PerlTidy profile not readable") if ($profile and !-f $profile); # Profie may be undef

my ($destination, $stderr, $argv);

my $error_flag = Perl::Tidy::perltidy(
    argv        => $argv,
    source      => \$source,
    destination => \$destination,
    stderr      => \$stderr,
    perltidyrc  => $profile,
);

# Will remove the UUID and any data beforehand in case we get any extra output anywhere. We really don't want to inject garbage (or logs) into people's source code
print "ee4ffa34-a14f-4609-b2e4-bf23565f3262${destination}ee4ffa34-a14f-4609-b2e4-bf23565f3262";


