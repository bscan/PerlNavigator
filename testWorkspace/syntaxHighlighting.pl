## no critic
use strict;
use v5.20;
no strict 'refs';
use utf8;
use PPR;

# Set up some variables to use
my ($bar, $baz, $qux, @vals);
$_ = 'Hello world';
my $baz = 'A';


# https://github.com/richterger/Perl-LanguageServer/issues/192
print "Not foo" if(!/#foo/);              # Negation regexes

# Regexes start after && but not after and: https://github.com/textmate/perl.tmbundle/issues/32
print "foo and bar" if(/foo/ and /bar/);  # "and" regexes

# Regexes don't start after grep: https://github.com/textmate/perl.tmbundle/issues/21
my @numbers = grep /\d+/, @vals;          # Grep with regex

# Regexes don't start after split:
# https://github.com/textmate/perl.tmbundle/issues/27 https://github.com/textmate/perl.tmbundle/issues/28, https://github.com/textmate/perl.tmbundle/issues/45,
# https://github.com/microsoft/vscode/issues/37966 https://github.com/microsoft/vscode/issues/78708 https://github.com/microsoft/vscode/issues/155209 
# https://github.com/bscan/PerlNavigator/issues/110 
my @words = split /\|/, "Foo|bar|";        # split regexes /


# Regexes don't start after equals sign
# https://github.com/textmate/perl.tmbundle/issues/52, https://github.com/textmate/perl.tmbundle/issues/44
my ($match) = /Hello\s+(\S*)/;

#Regexes incorrectly trigger on //= on newlines: https://github.com/textmate/perl.tmbundle/issues/29
$bar
    //= {baz=>42}; # Close with /


my $foo = "Foo is %foo, but $bar->{baz} is baz"; # String interpolation

$foo = s/$baz/$qux/g;  # Left side of substitution allows vars too

# Correct punctuation variables
# https://github.com/textmate/perl.tmbundle/issues/46
say "Match" if $foo =~ /Foo($|::)/;

# https://github.com/Perl/perl5/issues/17742
$foo =~ /[$[]/;
$foo =~ /$()/;
$foo =~ /$/;

# Interpolation in character classes:
$foo =~ m/[$baz]/;

# https://github.com/textmate/perl.tmbundle/issues/18 
my ($ticket_id) = $foo =~ m((\d+)$);  # Runs on forever :)

# https://github.com/textmate/perl.tmbundle/issues/49
$foo =~ s{foo}{bar} if $bar; # BROKEN regex$


#https://github.com/textmate/perl.tmbundle/issues/33 https://github.com/microsoft/vscode/issues/96024 
$foo =~ tr{/+}{_-}; # Runs on forever :/
$foo =~ tr/x/y/; # Tr isn't exactly a string, but it's more stringlike than regexlike

my $jalapeños   = 42;  # Unicode identifiers

# Underscore vars: https://github.com/textmate/perl.tmbundle/issues/36
my $_underscore = 43; 

say ${^UNICODE};       # Caret variables
say $^C; 

# Support dereferencing: https://github.com/textmate/perl.tmbundle/pull/50 
say ${"foo"};


# https://github.com/textmate/perl.tmbundle/issues/48  https://github.com/microsoft/vscode/issues/127467 
sub foo # Comments wrong
{ }

sub bar{} # Subs without space before brace

sub my_proto(&$) {}  # Prototypes

$foo->map();   # Methods that look like keywords

# https://github.com/textmate/perl.tmbundle/issues/53
$foo->m->s ;   # m,s,x or y as method names -

# Newer keywords from https://github.com/textmate/perl.tmbundle/pull/23
my $evaled = evalbytes "1+1"; 

# Package comments broken
package # hide me from PAUSE
    Foo::Pack;


#https://github.com/bscan/PerlNavigator/issues/109
use constant SHIFT_LEFT => 4;
my $test = 1234;
my $shifted_test = $test << SHIFT_LEFT;
# This is a comment; 

