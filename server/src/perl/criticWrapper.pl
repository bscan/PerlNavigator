use strict;
use warnings;
use Getopt::Long;
use utf8;
use Unicode::Normalize qw(NFKD);
use open qw(:std :utf8);

if ( !eval{ require PPI; require Perl::Critic; 1} ){
    print "\nSkipping Perl::Critic as it is not installed\n";
    exit(0);
}
=head

my $foo =2;
=cut

my ($file, $profile);
GetOptions ("file=s"    => \$file,
            "profile=s" => \$profile);

my $sSource = do { local $/; <STDIN> };
die("Did not pass any source via stdin") if !defined($sSource);
die("Critic profile not readable") if ($profile and !-f $profile); # Profie may be undef
# Do not check for readability of the file since we never actually read it. Only checking the name for policy violations.

print "Analyzing $file\n";
$sSource =~ s/([^\x00-\x7F])/AsciiReplacementChar($1)/ge;

my $doc = PPI::Document->new( \$sSource);

$doc->{filename} = $file;

my $critic = Perl::Critic->new( -profile => $profile);
Perl::Critic::Violation::set_format("%s~|~%l~|~%c~|~%m~|~%p~||~");

my @violations = $critic->critique($doc);

print "Perl Critic violations:\n";
foreach my $viol (@violations){
    print "$viol\n";
}



sub AsciiReplacementChar {
    # Tries to find ascii replacements for non-ascii characters.
    # Usually a horrible solution, but Perl::Critic otherwise crashes on unicode data

    my ( $sChar ) = @_;
    my $sSanitized= NFKD($sChar);
    $sSanitized =~ s/[^a-zA-Z]//g;
    if(length($sSanitized) >= 1){
        # This path is decent. Basically strips accents and character modifiers.
        # Might turn 1 character into multiple (ligatures, roman numerals)
        return $sSanitized
    }
    # Far worse, but we still need a character. Map to a deterministic choice in A-Za-z.
    # Totally butchers the word, but allows critic to still find unused subs, duplicate hash keys, etc.
    my $ord = ord($sChar) % 52;
    return $ord < 26 ? chr($ord + 65) : chr($ord + 71);
}


