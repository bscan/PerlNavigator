use strict;
use warnings;
use Getopt::Long;
use File::Spec;
use File::Basename;
use utf8;
use Unicode::Normalize qw(NFKD);
use open qw(:std :utf8);

my $sSource = do { local $/; <STDIN> };

if ( !eval{ require PPI; require Perl::Critic; 1} ){
    print "\nSkipping Perl::Critic as it is not installed\n";
    # Quit early is fine, but needs to happen after fully reading STDIN due to a pipe issue on MacOS.
    exit(0);
}
=head

my $foo =2;
=cut

my ($file, $profile);
GetOptions ("file=s"    => \$file,
            "profile=s" => \$profile);

die("Did not pass any source via stdin") if !defined($sSource);

$profile = resolve_profile($profile);

# Do not check for readability of the source $file since we never actually read it. Only checking the name for policy violations.
print "Perlcritic on $file and using profile $profile \n";
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

sub resolve_profile {
    my $profile = shift;
    if ($profile){
        return $profile if -f $profile;
        die("User specified Critic profile $profile not readable");
    }

    if ( my $home_dir = find_home_dir() ) {
        $profile = File::Spec->catfile( $home_dir, '.perlcriticrc' );
        return $profile if -f $profile;
    }

    $profile = File::Spec->catfile( File::Basename::dirname(__FILE__), 'defaultCriticProfile' );
    die("Can't find Navigator's default profile $profile ?!") unless( -f $profile );

    return $profile;
}

sub find_home_dir {
    # This logic is taken from File::HomeDir::Tiny (via Perl::Critic)
    return
        ($^O eq 'MSWin32') && ("$]" < 5.016)  ## no critic ( Variables::ProhibitPunctuationVars ValuesAndExpressions::ProhibitMagicNumbers ValuesAndExpressions::ProhibitMismatchedOperators )
            ? ($ENV{HOME} || $ENV{USERPROFILE})
            : (<~>)[0];
}