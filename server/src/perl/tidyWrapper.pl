use strict;
use warnings;
use Getopt::Long qw( GetOptions );
use utf8;
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

my ($destination, $stderr, $formatErrors, $argv);

$argv = '-nst';

my $error_flag = Perl::Tidy::perltidy(
    argv        => $argv,
    source      => \$source,
    destination => \$destination,
    stderr      => \$stderr,
    errorfile   => \$formatErrors, # Important to make sure the user's workspace is not polluted with .ERR files
    perltidyrc  => $profile,
);

# Will remove the UUID and any data beforehand in case we get any extra output anywhere. We really don't want to inject garbage (or logs) into people's source code
print "ee4ffa34-a14f-4609-b2e4-bf23565f3262${destination}ee4ffa34-a14f-4609-b2e4-bf23565f3262";


