use strict;
use warnings;
use Getopt::Long qw( GetOptions );
use File::Spec ();
use File::Basename ();
use utf8;
use Unicode::Normalize qw( NFKD );
use open qw(:std :utf8);

my $sSource = do { local $/; <STDIN> };

if ( !eval{ require PPI; require Perl::Critic; 1} ){
    print "\nSkipping Perl::Critic as it is not installed\n";
    # Quit early is fine, but needs to happen after fully reading STDIN due to a pipe issue on MacOS.
    exit(0);
}

my ($file, $profile, $severity, $theme, $exclude, $include);
GetOptions ("file=s"     => \$file,
            "profile=s"  => \$profile,
            "severity=s" => \$severity,
            "theme=s"    => \$theme,
            "exclude=s"  => \$exclude,
            "include=s"  => \$include,
            );

die("Did not pass any source via stdin") if !defined($sSource);

$profile = resolve_profile($profile);

# Do not check for readability of the source $file since we never actually read it. Only checking the name for policy violations.
print "Perlcritic on $file and using profile $profile \n";
$sSource =~ s/([^\x00-\x7F])/AsciiReplacementChar($1)/ge;
$sSource = adjustForKeywords($sSource);

my $doc = PPI::Document->new( \$sSource);

$doc->{filename} = $file;

my $exclude_ref = $exclude ? [$exclude] : [] ;
my $include_ref = $include ? [$include] : [] ;

my $critic = Perl::Critic->new( -profile => $profile, -severity => $severity, -theme => $theme, -exclude => $exclude_ref, -include => $include_ref);
Perl::Critic::Violation::set_format("%s~|~%l~|~%c~|~%m~|~%p~||~");

my @violations = $critic->critique($doc);

print "Perl Critic violations:\n";
foreach my $viol (@violations){
    print "$viol\n";
}

sub adjustForKeywords {
    # PPI can't handle Keywords like `async` or `method`. This is a couple of hacks to make it work.
    # Be careful about using \s in any substitutions since it'll match newlines and throw off the line count for reporting issues.

    $sSource = shift;

    # Change `async sub` to `sub`, and keep the word sub aligned where the line started. Also supports method and multi
    $sSource =~ s/^(\h*)(?:async\h+)?(?:multi\h+)?(?:method|sub)\h(?=\h*\w)/${1}sub /gm;

    # Another possible alignment. This was an attempt at keeping the name aligned.
    # $sSource =~ s/^(\h*)((?:async\h+)?)(method|sub)\h(?=\h*\w)/"$1" . (" " x (length($2) + length($3) - 3)) . "sub "/gme;

    if ($sSource =~ /^use\h+(?:Object::Pad|feature\h.*class.*|experimental\h.*class.*|Feature::Compat::Class)[\h;]/m){
        # Object::Pad or the new corinna. Eventually needs to be updated with use v.?? when it becomes part of a feature bundle

        # classes become packages (which they are) to support RequireExplicitPackage and RequireFilenameMatchesPackage
        $sSource =~ s/^(\h*)class\h(?=\h*\w)/${1}package /gm;

        # ADJUST blocks and similar are not processed correctly since they aren't recognized. Important for Modules::RequireEndWithOne
        $sSource =~ s/^(\h*)(ADJUST|ADJUST\h+:params|ADJUSTPARAMS|BUILD)(?=\h*\s?(\{|\())/${1}sub $2/gm;

        # Change private sigil'd methods to regular subs. Single underscore would get caught by Subroutines::ProhibitUnusedPrivateSubroutines
        $sSource =~ s/^(\h*)method\h+\$(?=\w)/${1}sub /gm;
    }

    return $sSource;
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

    return $ENV{'PERLCRITIC'} if $ENV{'PERLCRITIC'} && -r $ENV{'PERLCRITIC'};

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
