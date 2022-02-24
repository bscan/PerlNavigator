package pltags;

# pltags - create a tags file for Perl code

# Originally written by Michael Schaap <pltags@mscha.com>.
# Modified for use in the Perl Navigator by bscan https://github.com/bscan
# Some code leveraged from Perl::Tags::Naive https://metacpan.org/pod/Perl::Tags::Naive


# Complain about undeclared variables
use strict;
no warnings;
use utf8;
use Text::Balanced qw();

use Exporter;
our @ISA    = qw(Exporter);
our @EXPORT_OK = qw(build_pltags);

# Global variables
my $VERSION = "2.4";    # pltags version

# Create a tag file line and push it on the list of found tags
sub MakeTag {
    my (
        $tag,           # Tag name
        $type,          # Type of tag
        $typeDetails,   # Additional details on type
        $file,          # File in which tag appears
        $line_number,
        $package_name,  
        $tagsRef,        # Existing tags
    ) = @_;             # Line in which tag appears

    # Only process tag if not empty
    if ($tag) {
 
        # Create a tag line
        my $tagline = "$tag\t$type\t$typeDetails\t$file\t$package_name\t$line_number\t";

        # Push it on the stack
        push(@$tagsRef, $tagline);
    }
}

sub SubEndLine {
    my ($paCode, $line_num, $offset) = @_;
    my $end = $#$paCode - $line_num > 700 ? $line_num + 700 : $#$paCode;    # Limit to 700 line subroutines for speed. Will still display otherwise, but won't have depth
    # Contains workaraound for https://rt.cpan.org/Public/Bug/Display.html?id=78313
    my $toInpect = join("\n", map { CleanForBalanced($_) } @{$paCode}[$line_num..$end]);            # All code from sub { through end of file
    print "\nLooking at $toInpect\n";
    my ($extracted, undef, $prefix) = Text::Balanced::extract_codeblock($toInpect, '{', '(?s).*?(?=[{;])'); # Will ignore up to start of sub, and then match through to the end
    return $line_num - $offset + 1 if (!$extracted);  # if we didn't find the end, mark the end at the beginning. 
    $extracted = $prefix . $extracted; 
    my $length = $extracted =~ tr/\n//; # Count lines in sub definition
    return $line_num + $length - $offset + 1;
}

# Finding the end of a package is hard because of the different syntaxes:
# package foo; contents
# package { contents }
# { package foo; contents } 
sub PackageEndLine  {
    my ($paCode, $line_num, $offset) = @_;
    my $end = $#$paCode - $line_num > 1200 ? $line_num + 1200 : $#$paCode;  # Limit to 1200 line subroutines for speed
    my @smallCopy = map { CleanForBalanced($_) } @{$paCode}[$line_num..$end];
    my $toInpect = join("\n", @smallCopy);                       # Maybe we're already in a scope, so look for the end of it. 
    my $prefixRg = undef;
    if ($paCode->[$line_num] =~ /package[^#]+;/){ # Single line package definition.
        if ($paCode->[$line_num] =~ /{.*package/ or ( ($line_num - $offset + 1) > 0 and  $paCode->[$line_num-1] =~ /{/)){
            # Text::Balanced is pretty unreliable, so don't hunt for the closing } unless you absolutely need to.
            $toInpect = "{" . $toInpect; 
        } else {
            $toInpect = "";
        }
    } else {
        $prefixRg = '(?s).*?(?=[{;])'; # Start new block either now or on upcoming lines
    }
    my $extracted = Text::Balanced::extract_codeblock($toInpect, '{', $prefixRg); 
    my $length;
    if ($extracted){ 
        $length = $extracted =~ tr/\n//; # Count lines in sub definition
    }
    
    my $count = 1;
    shift @smallCopy; # Remove first line to avoid finding itself
    foreach my $stmt (@smallCopy){
        last if (defined($length) and $count > $length);
        if($stmt =~ /^\s*package\s+([\w:]+)/){
            $length = $count-1;
            last;
        }
        $count++;
    }

    if ($length){
        # If we found a delimited package
        return $line_num + $length - $offset + 1;
    } else {
        # Run until end of package
        return $line_num + $#$paCode - $offset + 1;
    }
}

sub CleanForBalanced {
    # Text::Balanced seems to struggle on some of the newer constructs of Perl such as the // operator introduced in Perl 5.10 https://rt.cpan.org/Public/Bug/Display.html?id=78313
    # and postfix dereferencing, and unicode characters. For finding codeblocks though, we can generally simply strip these characters out.
    my $input = shift;
    $input =~ s@\s//=?\s@\s\s@g;
    # $input =~ s@\s//(\n|\s)@ ||$1@g; 
    $input =~ s/[^\x00-\x7F]/ /g;
    $input =~ s/->@\*/ /g;

    # A different approach to keep around; Remove everything except the bare minimum. Will do bracket matching and anything that impacts the interpretation of those brackets (e.g. regex, quotes, comments).
    #$input =~ s/[^\{\}#\\\/"'`]/ /g;

    return $input;
}

sub build_pltags {

    my ($code, $offset, $file) = @_;
    my @tags = ();      # List of produced tags
    my @packages = ();    # List of discovered packages

    my $package_name  = "";
    my $var_continues = 0;
    my $line_number = -$offset;
        
    my @code = split("\n", $code);
    my $n = scalar(@code);
    my @codeClean;

    # Loop through file
    for (my $i=0; $i<$n;$i++){
        $line_number++;

        my $line = $code[$i];

        $line = "" if $line_number < 0;

        # Skip pod. Applied before stripping leading whitespace
        $line = "" if ($line =~ /^=(?:pod|head|head1|head2|head3|head4|over|item|back|begin|end|for|encoding)/ .. $line =~ /^=cut/); 
        last if ($line =~ /^(__END__|__DATA__)\s*$/); 

        if ($line =~ /#.*(\$\w+) isa ([\w:]+)\b/){
            MakeTag($1, $2, '1', $file, $line_number, $package_name, \@tags);
        }

        # Statement will be line with comments, whitespace and POD trimmed
        my $stmt;
        ($stmt = $line) =~ s/#.*//;
        $stmt =~ s/^\s*//;
        $stmt =~ s/\s*$//;

        push @codeClean, $stmt;
    }

    $line_number = -$offset;
    for (my $i=0; $i<$n;$i++){
        $line_number++;

        my $stmt = $codeClean[$i];

        # Nothing left? Never mind.
        next unless ($stmt);

        # TODO, allow specifying list of constructor names as config
        my $constructors = qr/(?:new|connect)/;
        # Declaring an object. Let's store the type
        if ($stmt =~ /^(?:my|our|local|state)\s+(\$\w+)\s*\=\s*([\w\:]+)\-\>$constructors\s*(?:\((?!.*\)\->)|;)/ or
            $stmt =~ /^(?:my|our|local|state)\s+(\$\w+)\s*\=\s*new (\w[\w\:]+)\s*(?:\((?!.*\)\->)|;)/) {
            my ($varName, $objName) = ($1, $2);
            $objName .= "::db" if ($objName =~ /\bDBI$/);
            MakeTag($varName, $objName, '', $file, $line_number, $package_name, \@tags);
            $var_continues = 0; # We skipped ahead of the line here.
        }
        # This is a variable declaration if one was started on the previous
        # line, or if this line starts with my or local
        elsif (   $var_continues
            or ($stmt =~ /^(?:my|our|local|state)\b/)) {
            # The declaration continues if the line does not end with ;
            $var_continues = ($stmt !~ /;$/ and $stmt !~ /[\)\=\}\{]/);
            
            # Remove my or local from statement, if present
            $stmt =~ s/^(my|our|local|state)\s+//;

            # Remove any assignment piece
            $stmt =~ s/\s*=.*//;

             # Remove part where sub starts (for signatures). Consider other options here.
            $stmt =~ s/\s*\}.*//;

            # Now find all variable names, i.e. "words" preceded by $, @ or %
            my @vars = ($stmt =~ /([\$\@\%][\w:]+)\b/g);

            foreach my $var (@vars) {
                MakeTag($var, "v", '', $file, $line_number, $package_name, \@tags);
            }
        }

        # Lexical loop variables, potentially with labels in front. foreach my $foo
        elsif ( $stmt =~ /^(?:(\w+)\s*:(?!\:))?\s*(?:for|foreach)\s+my\s+(\$[\w]+)\b/) {
            if ($1){
                MakeTag($1, "l", '', $file, $line_number, $package_name, \@tags) 
            }
            MakeTag($2, "v", '', $file, $line_number, $package_name, \@tags);
        }

        # Lexical match variables if(my ($foo, $bar) ~= )
        elsif ( $stmt =~ /^(?:\}\s*elsif|if|unless|while|until|for)\s*\(\s*my\b(.*)$/) {
            # Remove any assignment piece
            $stmt =~ s/\s*=.*//;
            my @vars = ($stmt =~ /([\$\@\%][\w]+)\b/g);
            foreach my $var (@vars) {
                MakeTag($var, "v", '', $file, $line_number, $package_name, \@tags);
            }
        }

        # This is a package declaration if the line starts with package
        elsif ($stmt =~ /^package\s+([\w:]+)/) {
            # Get name of the package
            $package_name = $1;
            my $end_line = PackageEndLine(\@codeClean, $i, $offset);
            MakeTag($package_name, "p", '', $file, "$line_number;$end_line", $package_name, \@tags);
            push(@packages, $package_name);
        }

        # This is a class decoration for Object::Pad, Corinna, or Moops 
        elsif ($stmt =~ /^class\s+([\w:]+)/) {
            # Get name of the package
            my $class_name = $1;

            my $end_line = SubEndLine(\@codeClean, $i, $offset);
            MakeTag($class_name, "a", '', $file, "$line_number;$end_line", $package_name, \@tags);
            push(@packages, $package_name);
        }
        
        # This is a role decoration for Object::Pad, Corinna, or Moops 
        elsif ($stmt =~ /^role\s+([\w:]+)/) {
            # Get name of the package
            my $role_name = $1;

            my $end_line = SubEndLine(\@codeClean, $i, $offset);
            MakeTag($role_name, "b", '', $file, "$line_number;$end_line", $package_name, \@tags);
            push(@packages, $package_name);
        }

        # This is a sub declaration if the line starts with sub
        elsif ($stmt =~ /^(sub|method)\s+([\w:]+)(\s+:method)?/) {
            my $subName = $2;
            my $kind = ($1 eq 'method' or $3) ? 'o' : 's';
            my $end_line = SubEndLine(\@codeClean, $i, $offset);
            MakeTag($subName, $kind, '', $file, "$line_number;$end_line", $package_name, \@tags);

            # Match the after the sub declaration and before the start of the actual sub for signatures
            if($stmt =~ /^sub\s+[\w:]+([^{]*)/){
                my @vars = ($1 =~ /([\$\@\%][\w:]+)\b/g);

                # Define subrountine signatures, but exclude prototypes
                # The declaration continues if the line does not end with ;
                $var_continues = ($stmt !~ /;$/ and $stmt !~ /[\)\=\}\{]/);

                foreach my $var (@vars) {
                    MakeTag($var, "v", '', $file, $line_number, $package_name, \@tags);
                }
            }
        }

        # Phaser block
        elsif ($stmt=~/^(BEGIN|INIT|CHECK|UNITCHECK|END)\s*\{/) {
            my $phaser = $1;
            my $end_line = SubEndLine(\@codeClean, $i, $offset);
            MakeTag($phaser, "e", '', $file, "$line_number;$end_line", $package_name, \@tags);
        }

        # Label line
        elsif ($stmt=~/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:[^:].*{\s*$/) {
            my $label = $1;
            my $end_line = SubEndLine(\@codeClean, $i, $offset);
            MakeTag($label, "l", '', $file, "$line_number;$end_line", $package_name, \@tags);
        }

        # Constants. Important because they look like subs (and technically are), so I'll tags them as such 
        elsif ($stmt =~/^use\s+constant\s+(\w+)\b/) {
            MakeTag($1, "n", '', $file, $line_number, $package_name, \@tags);
            MakeTag("constant", "u", '', $file, $line_number, $package_name, \@tags);
        }

        elsif ($stmt=~/^has(?:\s+|\()(?:["']|\$)?(\w+)\b/) { # Moo/Moose/Object::Pad/Moops/Corinna attributes
            MakeTag($1, "f", '', $file, $line_number, $package_name, \@tags);
            # If you have a locally defined package/class Foo want to reference the attributes as Foo::attr or $foo->attr, you need the full path.
            # Subs don't need this since we find them at compile time. We also find "d" types from imported packages in Inquisitor.pm
            MakeTag("${package_name}::$1", "d", '', $file, $line_number, $package_name, \@tags);
        }

        elsif ($stmt=~/^around\s+["']?(\w+)\b/) { # Moo/Moose overriding subs. 
            MakeTag($1, "s", '', $file, $line_number, $package_name, \@tags);
        } 
        
        elsif ($stmt=~/^use\s+([\w:]+)\b/) { # Keep track of explicit imports for filtering
            MakeTag("$1", "u", '', $file, $line_number, $package_name, \@tags);
        }

    }

    return \@tags, \@packages;
}

1;