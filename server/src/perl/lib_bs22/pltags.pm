package pltags;

# pltags - create a tags file for Perl code

# Originally written by Michael Schaap <pltags@mscha.com>.
# Modified for use in the Perl Navigator by bscan https://github.com/bscan
# Some code leveraged from Perl::Tags::Naive https://metacpan.org/pod/Perl::Tags::Naive


# Complain about undeclared variables
use strict;
no warnings;
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
        $file,          # File in which tag appears
        $line_number,
        $package_name,
        $tagsRef,        # Existing tags
    ) = @_;             # Line in which tag appears

    # Only process tag if not empty
    if ($tag) {
 
        # Create a tag line
        my $tagline = "$tag\t$type\t$file\t_\t$line_number\t_";

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

    my $file = shift;
    my @tags = ();      # List of produced tags
    my @packages = ();    # List of discovered packages

    # Skip if this is not a file we can open.  Also skip tags files and backup
    # files

    return \@tags unless ((-f $file)
        && (-r $file)
        && ($file !~ /tags$/)
        && ($file !~ /~$/));

    my $package_name  = "";
    my $var_continues = 0;
    my $file_handle;
    my $line_number = 0;
    open($file_handle, '<', $file) or die "Can't open file '$file': $!";

    # Loop through file
    while ( my $line = <$file_handle> ){
        $line_number++;
        # Statement is line with comments and whitespace trimmed
        my $stmt;
        ($stmt = $line) =~ s/#.*//;
        $stmt =~ s/^\s*//;
        $stmt =~ s/\s*$//;

        # Nothing left? Never mind.
        next unless ($stmt);

        # This is a variable declaration if one was started on the previous
        # line, or if this line starts with my or local
        if (   $var_continues
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
                MakeTag($var, "v", $file, $line_number, $package_name, \@tags);
            }
        }

        # Lexical loop variables, potentially with labels in front. foreach my $foo
        elsif ( $stmt =~ /^(?:(\w+)\s*:(?!\:))?\s*(?:for|foreach)\s+my\s+(\$[\w]+)\b/) {
            if ($1){
                MakeTag($1, "l", $file, $line_number, $package_name, \@tags) 
            }
            MakeTag($2, "v", $file, $line_number, $package_name, \@tags);
        }

        # Lexical match variables if(my ($foo, $bar) ~= )
        elsif ( $stmt =~ /^(?:\}\s*elsif|if|unless|while|until)\s*\(\s*my\b(.*)$/) {
            # Remove any assignment piece
            $stmt =~ s/\s*=.*//;
            my @vars = ($stmt =~ /([\$\@\%][\w]+)\b/g);
            foreach my $var (@vars) {
                MakeTag($var, "v", $file, $line_number, $package_name, \@tags);
            }
        }

        # This is a package declaration if the line starts with package
        elsif ($stmt =~ /^package\b/) {
            # Get name of the package
            $package_name = PackageName($stmt);

            if ($package_name) {
                MakeTag($package_name, "p", $file, $line_number, $package_name, \@tags);
                push(@packages, $package_name);
            }
        }

        # This is a sub declaration if the line starts with sub
        elsif ($stmt =~ /^sub\b/) {
            MakeTag(SubName($stmt), "s", $file, $line_number, $package_name, \@tags);


            # Define subrountine signatures, but exclude prototypes
            # The declaration continues if the line does not end with ;
            $var_continues = ($stmt !~ /;$/ and $stmt !~ /[\)\=\}\{]/);
            
            # Match the after the sub declaration and before the start of the actual sub. 
            if($stmt =~ /sub\s+[\w:]+([^{]*)/){
                my @vars = ($1 =~ /([\$\@\%][\w:]+)\b/g);
                foreach my $var (@vars) {
                    MakeTag($var, "v", $file, $line_number, $package_name, \@tags);
                }
            }
        }

        # Label line
        elsif ($stmt=~/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:(?:[^:]|$)/) {
            MakeTag($1, "l", $file, $line_number, $package_name, \@tags);

        }

        # Constants. Important because they look like subs (and technically are), so I'll tags them as such 
        elsif ($stmt =~/^use\s+constant\s+(\w+)\b/) {
            MakeTag($1, "s", $file, $line_number, $package_name, \@tags);
        }
    }
    close($file_handle);

    return \@tags, \@packages;
}
