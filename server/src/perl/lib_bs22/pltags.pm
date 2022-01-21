package pltags;

# pltags - create a tags file for Perl code, for use by vi(m)
#
# Distributed with Vim <http://www.vim.org/>, latest version always available
# at <http://www.mscha.com/mscha.html?pltags#tools>
#
# Version 2.3, 28 February 2002
#
# Written by Michael Schaap <pltags@mscha.com>.  Suggestions for improvement
# are very welcome!
#
# This script will not work with Perl 4 or below!
#
# Revision history:
#  1.0  1997?     Original version, quickly hacked together
#  2.0  1999?     Completely rewritten, better structured and documented,
#		  support for variables, packages, Exuberant Ctags extensions
#  2.1	Jun 2000  Fixed critical bug (typo in comment) ;-)
#		  Support multiple level packages (e.g. Archive::Zip::Member)
#  2.2	Jul 2001  'Glob' wildcards - especially useful under Windows
#		  (thanks to Serge Sivkov and Jason King)
#		  Bug fix: reset package name for each file
#  2.21 Jul 2001  Oops... bug in variable detection (/local../ -> /^local.../)
#  2.3	Feb 2002  Support variables declared with "our"
#		  (thanks to Lutz Mende)
#  2.4 June 2021 Converting to module to support Perl Navigator Language Server

# Complain about undeclared variables
use strict;
no warnings;
use Exporter;
our @ISA    = qw(Exporter);
our @EXPORT_OK = qw(build_pltags);

# Options with their defaults
my $do_subs = 1;    # --subs, --nosubs    include subs in tags file?
my $do_vars = 1;    # --vars, --novars    include variables in tags file?
my $do_pkgs = 1;    # --pkgs, --nopkgs    include packages in tags file?


# Global variables
my $VERSION = "2.4";    # pltags version

# Create a tag file line and push it on the list of found tags
sub MakeTag {
    my (
        $tag,           # Tag name
        $type,          # Type of tag
        $is_static,     # Is this a static tag?
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

# Parse all variable names from statement
sub VarNames {
    my ($stmt) = @_;

    # Remove my or local from statement, if present
    $stmt =~ s/^(my|our|local)\s+//;

    # Remove any assignment piece
    $stmt =~ s/\s*=.*//;

    # Now find all variable names, i.e. "words" preceded by $, @ or %
    my @vars = ($stmt =~ /([\$\@\%][\w:]+)\b/g);

    # Remove any parent package name(s)
    # TODO: Adjust regex now that the [\$\@\%] is on the front. Maybe don't remove the package at all?
    # map(s/.*://, @vars);

    return (@vars);
}

############### Start ###############

#print "\npltags $VERSION by Michael Schaap <mscha\@mscha.com>\n\n";


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

    my $is_pkg        = 0;
    my $package_name  = "";
    my $has_subs      = 0;
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
            or ($stmt =~ /^my\b/)
            or ($stmt =~ /^our\b/)
            or ($stmt =~ /^local\b/))
        {
            # The declaration continues if the line does not end with ;
            $var_continues = ($stmt !~ /;$/);

            # Loop through all variable names in the declaration
            foreach my $var (VarNames($stmt)) {
                # Make a tag for this variable unless we're told not to.  We
                # assume that a variable is always static, unless it appears
                # in a package before any sub.	(Not necessarily true, but
                # it's ok for most purposes and Vim works fine even if it is
                # incorrect)
                if ($do_vars) {
                    MakeTag($var, "v", (!$is_pkg or $has_subs), $file, $line_number, $package_name, \@tags);
                }
            }
        }

        # This is a package declaration if the line starts with package
        elsif ($stmt =~ /^package\b/) {
            # Get name of the package
            $package_name = PackageName($stmt);

            if ($package_name) {
                # Remember that we're doing a package
                $is_pkg = 1;

                # Make a tag for this package unless we're told not to.  A
                # package is never static.
                if ($do_pkgs) {
                    MakeTag($package_name, "p", 0, $file, $line_number, $package_name, \@tags);
                }
                push(@packages, $package_name);

            }
        }

        # This is a sub declaration if the line starts with sub
        elsif ($stmt =~ /^sub\b/) {
            # Remember that this file has subs
            $has_subs = 1;

            # Make a tag for this sub unless we're told not to.  We assume
            # that a sub is static, unless it appears in a package.  (Not
            # necessarily true, but it's ok for most purposes and Vim works
            # fine even if it is incorrect)
            if ($do_subs) {
                MakeTag(SubName($stmt), "s", (!$is_pkg), $file, $line_number, $package_name, \@tags);
            }
        }
    }
    close($file_handle);

    return \@tags, \@packages;
}
