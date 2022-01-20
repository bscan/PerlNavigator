package Inquisitor;

# be careful around importing anything since we don't want to pollute the users namespace
use strict;
use warnings; # TODO: Remove this after development, but remember that some people might use -cw anyway
#no warnings; # TODO: Reinstate this

my $bIdentify;

CHECK {
    eval {
        print "\n6993a1bd-f3bf-4006-9993-b53e45527147\n";

        require B;
        load_local_g12('ClassInspector.pm');

        # Check if Sub::Identify exists. Used for finding package names of C code (e.g. List::Util)
        eval { require Sub::Identify; undef($!); $bIdentify = 1; }; 

        my $modules = dump_loaded_mods_g12();

        dump_vars_to_main_g12("main::");

        # This following one has the largest impact on memory and finds less interesting stuff. Low limits though, which probably helps
        $modules = filter_modules_g12($modules);

        dump_subs_from_modules_g12($modules);

        my $packages = pltags_g12();

        foreach my $package (@$packages){
            # This is finding packages in the file we're inspecting, and then dumping them into the files namespace for easy navigation
            dump_vars_to_main_g12("${package}::") if $package;
        }
        1; # For the eval
    } or do {
        my $error = $@ || 'Unknown failure';
        print "PN:inquistor failed with error: $error\n";
    };
}



sub maybe_print_sub_info_g12 {    # Weird name to avoid collisions
    my ($sFullPath, $sDisplayName, $codeRef) = @_;
    my $UNKNOWN = "_";

    if (defined &$sFullPath or $codeRef) {
        $codeRef ||= \&$sFullPath;

        my $meta = B::svref_2object($codeRef);
        $meta->isa('B::CV') or return 0;

        my $file = $meta->START->isa('B::COP') ? $meta->START->file : $UNKNOWN;
        my $line = $meta->START->isa('B::COP') ? $meta->START->line : $UNKNOWN;

        my $mod;
        if ($bIdentify) {
            $mod = Sub::Identify::stash_name($codeRef);
            $mod = defined($mod) ? $mod : $UNKNOWN;    # The // would be cool, but didn't exist until 5.10  
        } else {
            $mod = $meta->GV->isa('B::SPECIAL') ? $meta->GV->STASH->NAME : $UNKNOWN;
        }
        return 0 if $file =~ /([\0-\x1F])/ or $mod =~ /([\0-\x1F])/;
        return 0 if $file =~ /(Moo.pm|Exporter.pm)$/; # Objects pollute the namespace, many things have exporter

        if ($file ne $0) { # pltags will find everything in $0
            print_g12($sDisplayName || $sFullPath, "s", $file, $mod, $line, '_') ;
            return 1;
        }
    }
    return 0;
}

sub print_g12 {
    # Dump details to STDOUT. Format depends on type
    my ($symbol, $type, $file, $mod, $line, $value) = @_;
    #TODO: strip tabs and newlines from all of these? especially value
    return if $value =~ /[\0-\x1F]/;
    print "$symbol\t$type\t$file\t$mod\t$line\t$value\n";
}

sub pltags_g12 {
    load_local_g12('pltags.pm');
    my $orig_file = File::Spec->rel2abs($0);
    print "\n--------------Now Building pltags for $orig_file ---------------------\n";
    my ($tags, $packages) = pltags::build_pltags($orig_file); # $0 should be the script getting compiled, not this module
    foreach my $newTag (@$tags){
        print $newTag . "\n";
    }
    return $packages
}

sub load_local_g12 {
    my ($modName) = @_;
    # TODO: Can I remove these? They pollute the namespace already
    require File::Basename;
    require File::Spec;
    my $module_dir = File::Basename::dirname(__FILE__);
    require File::Spec->catfile($module_dir, 'lib_bs22', $modName);
}

sub dump_vars_to_main_g12 {
    my ($package) = @_;
    no strict 'refs'; ## no critic

    foreach my $thing (keys %$package) {
        next if $thing =~ /^_</;           # Remove all filenames
        next if $thing =~ /_g12$/;         # End internal variables and functions with this random sequence
        next if $thing =~ /([\0-\x1F])/;   # Perl built-ins come with non-printable control characters

        my $sFullPath = $package . $thing;
        maybe_print_sub_info_g12($sFullPath, $thing); 

        if (defined ${$sFullPath}) {
            my $value = ${$sFullPath};
            print_g12("\$$thing", "scalar", '_', '_', '', $value);
        } elsif (@{$sFullPath}) {
            my $value = join(',', map({ defined($_) ? $_ : "" } @{$sFullPath}));
            print_g12("\@$thing", "array", '_', '_', '', $value);
        } elsif (%{$sFullPath} ) {
            next if ($thing =~ /::/);
            # Hashes are usually large and unordered, with less interesting stuff in them. Reconsider printing values if you find a good use-case.
            print_g12("%$thing", "hash", '_', '_', '', '_');
        }
    }
}

sub dump_subs_from_modules_g12 {
    my $modules = shift;
    my $sCount = 0;
    INSPECTOR: foreach my $mod (@$modules){
        my $pkgCount = 0;
        my $methods = ClassInspector->methods( $mod );
        #my $methods = ClassInspector->functions( $mod ); # Less memory, but less accurate?
        @$methods = sort { $b cmp $a } @$methods; # Reverse sorting puts private subs _ at the end which are less important and might get cut by the limit. 

        foreach my $name (@$methods){
            # TODO: Consider sorting methods to get public methods before private ones (due to limiting)
            next if $name =~ /^(F_|O_|L_)/; # The unhelpful C compiled things
            next if $name =~ /[A-Z_]+$/;    # Remove uppercase things as generally less important. TODO: Update sorting to keep uppercase things at the end of the list.
            if (my $codeRef = $mod->can($name)) {
                # TODO: Differentiate functions vs methods. Methods come from here, but so do functions. Perl mixes the two definitions anyway.
                my $iRes = maybe_print_sub_info_g12("${mod}::${name}", '', $codeRef);
                $pkgCount += $iRes;
                $sCount += $iRes;
            }
            # Just in case we find too much stuff. The limits are currently intentionally low
            last INSPECTOR if $sCount >  5000; 
            next INSPECTOR if $pkgCount >  50;
        }
    }
    return;
}

sub filter_modules_g12 {
    my ($modules) = @_;

    # Some of these things I've imported in here, some are just piles of C code.
    # We'll still nav to modules and find anything explictly imported so we can be aggressive at removing these. 
    # TODO: Figure out how to keep File::Spec and File::Basename when user has explicitly imported them.
    my @to_remove = ("Cwd", "B", "main","version","POSIX","Fcntl","Errno","Socket", "DynaLoader","CORE","utf8","UNIVERSAL","PerlIO","re","Internals","strict","mro","Regexp",
                      "Exporter","Inquisitor", "XSLoader","attributes", "Sub::Identify","warnings","strict","utf8","File::Spec","File::Basename","constant","XSLoader");

    my $filter_regex = qr/^(File::Spec::|warnings::register|::lib_bs22::)/;

    my %filter = map { $_ => 1 } @to_remove;
    my @filtered = grep { !$filter{$_} and $_ !~ $filter_regex} @$modules;

    return \@filtered;
}

sub dump_loaded_mods_g12 {
    my @modules;

    foreach my $module (keys %INC) {
        my $display_mod = $module;
        $display_mod =~ s/[\/\\]/::/g;
        $display_mod =~ s/(?:\.pm|\.pl)$//g;
        next if $display_mod =~ /::lib_bs22::/;
        my $path = $INC{$module};
        push @modules, $display_mod if ClassInspector->loaded($display_mod);
        print_g12("$display_mod", "mod", $path, $display_mod, 0, "_");
    }
    return \@modules;
}


1;

