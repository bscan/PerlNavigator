package pltags;

# pltags - create a tags file for Perl code

# Originally written by Michael Schaap <pltags@mscha.com>.
# Modified for use in the Perl Navigator by bscan https://github.com/bscan
# Some code leveraged from Perl::Tags::Naive https://metacpan.org/pod/Perl::Tags::Naive


# Complain about undeclared variables
use strict;
no warnings;
use utf8;

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

# Parse package name from statement
sub PackageName {
    my ($stmt) = @_;    # Statement

    # Look for the argument to "package".  Return it if found, else return ""
    if ($stmt =~ /^package\s+([\w:]+)/) {
        my $pkgname = $1;

        # Remove any parent package name(s)
        #$pkgname =~ s/.*://; # TODO: WHY WOULD WE REMOVE THIS????
        return $pkgname;
    } else {
        return "";
    }
}

# Parse sub name from statement
sub SubName {
    my ($stmt) = @_;    # Statement

    # Look for the argument to "sub".  Return it if found, else return ""
    if ($stmt =~ /^sub\s+([\w:]+)/) {
        my $subname = $1;

        # Remove any parent package name(s)
        $subname =~ s/.*://;
        return $subname;
    } else {
        return "";
    }
}

sub build_pltags {

    my ($code, $offset, $file) = @_;
    my @tags = ();      # List of produced tags
    my @packages = ();    # List of discovered packages

    my $package_name  = "";
    my $var_continues = 0;
    my $line_number = -$offset;
        
    # Loop through file
    foreach my $line (split("\n", $code)) {
        $line_number++;
        next if $line_number < 0;

        # Statement will be line with comments, whitespace and POD trimmed
        my $stmt;
        ($stmt = $line) =~ s/#.*//;

        # Skip pod. Applied before stripping leading whitespace
        next if ($line =~ /^=(?:pod|head|head1|head2|head3|head4|over|item|back|begin|end|for|encoding)/ .. $line =~ /^=cut/); 
        $stmt =~ s/^\s*//;
        $stmt =~ s/\s*$//;

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
        elsif ($stmt =~ /^package\b/) {
            # Get name of the package
            $package_name = PackageName($stmt);

            if ($package_name) {
                MakeTag($package_name, "p", '', $file, $line_number, $package_name, \@tags);
                push(@packages, $package_name);
            }
        }

        # This is a sub declaration if the line starts with sub
        elsif ($stmt =~ /^sub\b/) {
            MakeTag(SubName($stmt), "s", '', $file, $line_number, $package_name, \@tags);


            # Define subrountine signatures, but exclude prototypes
            # The declaration continues if the line does not end with ;
            $var_continues = ($stmt !~ /;$/ and $stmt !~ /[\)\=\}\{]/);
            
            # Match the after the sub declaration and before the start of the actual sub. 
            if($stmt =~ /^sub\s+[\w:]+([^{]*)/){
                my @vars = ($1 =~ /([\$\@\%][\w:]+)\b/g);
                foreach my $var (@vars) {
                    MakeTag($var, "v", '', $file, $line_number, $package_name, \@tags);
                }
            }
        }

        # Label line
        elsif ($stmt=~/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:(?:[^:]|$)/) {
            MakeTag($1, "l", '', $file, $line_number, $package_name, \@tags);

        }

        # Constants. Important because they look like subs (and technically are), so I'll tags them as such 
        elsif ($stmt =~/^use\s+constant\s+(\w+)\b/) {
            MakeTag($1, "s", '', $file, $line_number, $package_name, \@tags);
        }

        elsif ($stmt=~/^has\s+["']?(\w+)\b/) { # Moo/Moose variables. Look like variables, but act like methods
            MakeTag($1, "s", '', $file, $line_number, $package_name, \@tags);
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
