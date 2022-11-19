use strict;
use File::Find ();

sub get_modules {
    # Clean up @INC
    my @dirs;
    for my $dirname (@INC) {
        if (-d $dirname) {
            next if $dirname eq '.';
            $dirname =~ s{/+}{/}g;
            $dirname =~ s{/$}{};
            push @dirs, $dirname;
        }
    }
    @dirs = myuniq(@dirs);


    my @files;
    my @find_dirs = reduce_dirs(@dirs);
    File::Find::find(
        {
            wanted => sub {
                    if($File::Find::dir =~ /\/\./){$File::Find::prune = 1; return }; # Skip hidden dirs
                    push @files, $_ if -f $_ and /\.pm$/ },
            no_chdir => 1,
            follow_fast => 1,  # May generate duplicates
        },
        @find_dirs
    );
    @files = myuniq(@files);

    # Print those modules/files which match the regex
    my $mods;
    for my $file (@files) {

        my @ds;
        for my $dir (@dirs) {
            if (index($file, $dir) == 0) {
                push @ds, $dir;
            }
        }
        my $d = (sort {length($b) <=> length($a)} @ds)[0];
        my $rel = substr($file, (length($d)+1));
        $rel =~ s/\.pm$//;
        $rel =~ s{/}{::}g;
        $mods->{$rel} = $file if !defined($mods->{$rel}); # Dedupes with a preference for the first found in @INC, since that's the perl resolution order.
    }
    return $mods;
}



sub reduce_dirs {
    # Reduce a list of directory names by eliminating
    # names which contain other names.  For example,
    # if the input array contains (/a/b/c/d /a/b/c /a/b),
    # return an array containing (/a/b).
    my @dirs = @_;
    my %substring_count = map { $_ => 0 } @dirs;

    for my $x (@dirs) {
        for my $y (@dirs) {
            next if $x eq $y;
            if (index($x, $y) == 0) {
                # if y is substring of x, starting at position 0
                $substring_count{$x}++;
            }
        }
    }

    my @dsubs = grep { $substring_count{$_} == 0 } @dirs;

    return @dsubs;
}

sub myuniq {
    # List::Util didn't add uniq until Perl 5.26
    my %seen = ();
    my $k;
    return grep { defined $_ ? !$seen{$k=$_}++ : 0 } @_;
}

# use Time::HiRes;
# my $start = Time::HiRes::time();
my $modsFound = get_modules();

# Generally, having keywords like "if" provide hover or definitions as a module is more confusing than helpful.
my @modsToSkip = ('if', 'open', 'sort');
delete $modsFound->{$_} foreach @modsToSkip;

print "Dumping Mods\n";

foreach my $mod (keys %$modsFound){
    # Name mangling to avoid picking up random stuff from stdout. 
    print "\tM\t$mod\t$modsFound->{$mod}\t\n"; 
}

#print "Elapsed: " . (Time::HiRes::time() - $start);

1;


=head1 NAME
 
ModHunter

=head1 SYNOPSIS

The mod hunter is for finding the list of importable modules. Not sure why this is so hard.
ExtUtils doesn't work because it relies on packlists, and many modules (especially local in-house mods) don't have packlists.

The FAQ lists some options https://perldoc.perl.org/perlfaq3#How-do-I-find-which-modules-are-installed-on-my-system?
But one option is ExtUtils and the other gives filenames, not importable module names

App::Module::Lister is close, but opens all of the files which would slow this down substantially and is more likely to throw file system errors
HTML::Perlinfo::Modules is also close, but prints all the modules as HTML instead of returning the list. Perhaps it could be modified.

This script is mostly copied PerlMonks: https://www.perlmonks.org/?node_id=795418, and modified for my purposes. If someone has a maintained library that does this, let me know so I can delete this script entirely.
I modified it to skip private directories and to preserve order during lookup 

This is also pretty slow on Windows (takes 10 to 15 seconds on my machine), so we only run it on Server starup and when configuration changes



