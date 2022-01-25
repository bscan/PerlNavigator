package Inquisitor;

# be careful around importing anything since we don't want to pollute the users namespace
use strict;
no warnings; 

my $bIdentify; # Is Sub::Util available
my @preloaded; # Check what's loaded before we pollute the namespace


CHECK {
    eval {
        populate_preloaded();
        require B;
        require lib_bs22::Class::Inspector;

        # Sub::Util was added to core in 5.22. Used for finding package names of C code (e.g. List::Util)
        eval { require Sub::Util; $bIdentify = 1; }; 

        my $modules = dump_loaded_mods();

        dump_vars_to_main("main::");

        # This following one has the largest impact on memory and finds less interesting stuff. Low limits though, which probably helps
        $modules = filter_modules($modules);

        dump_subs_from_modules($modules);

        my $packages = run_pltags();
        print "Done with pltags. Now dumping same-file packages\n";

        foreach my $package (@$packages){
            # This is finding packages in the file we're inspecting, and then dumping them into the files namespace for easy navigation
            dump_vars_to_main("${package}::") if $package;
        }
        1; # For the eval
    } or do {
        my $error = $@ || 'Unknown failure';
        print "PN:inquistor failed with error: $error\n";
    };
}


sub maybe_print_sub_info {
    my ($sFullPath, $sDisplayName, $codeRef) = @_;
    my $UNKNOWN = "_";

    if (defined &$sFullPath or $codeRef) {
        $codeRef ||= \&$sFullPath;

        my $meta = B::svref_2object($codeRef);
        $meta->isa('B::CV') or return 0;

        my $file = $meta->START->isa('B::COP') ? $meta->START->file : $UNKNOWN;
        my $line = $meta->START->isa('B::COP') ? $meta->START->line - 1: $UNKNOWN;
        my $mod = $UNKNOWN;
        if ($bIdentify) {
            my $subname = Sub::Util::subname($codeRef);
            $mod = $1 if($subname =~ m/^(.+)::.*?$/);
        } else {
            # Pure Perl version is not as good. Only needed for Perl < 5.22
            $mod = $meta->GV->STASH->NAME if $meta->GV->isa('B::SPECIAL');
        }
        return 0 if $file =~ /([\0-\x1F])/ or $mod =~ /([\0-\x1F])/;
        return 0 if $file =~ /(Moo.pm|Exporter.pm)$/; # Objects pollute the namespace, many things have exporter

        if ($file ne $0) { # pltags will find everything in $0
            print_tag($sDisplayName || $sFullPath, "s", $file, $mod, $line, '_') ;
            return 1;
        }
    }
    return 0;
}

sub print_tag {
    # Dump details to STDOUT. Format depends on type
    my ($symbol, $type, $file, $mod, $line, $value) = @_;
    #TODO: strip tabs and newlines from all of these? especially value
    return if $value =~ /[\0-\x1F]/;
    $file = '' if $file =~ /^\(eval/;
    print "$symbol\t$type\t$file\t$mod\t$line\t$value\n";
}

sub run_pltags {
    require lib_bs22::pltags;
    require File::Spec;
    my $orig_file = File::Spec->rel2abs($0);
    print "\n--------------Now Building pltags for $orig_file ---------------------\n";
    my ($tags, $packages) = pltags::build_pltags($orig_file); # $0 should be the script getting compiled, not this module
    foreach my $newTag (@$tags){
        print $newTag . "\n";
    }
    return $packages
}

sub dump_vars_to_main {
    my ($package) = @_;
    no strict 'refs'; ## no critic

    foreach my $thing (keys %$package) {
        next if $thing =~ /^_</;           # Remove all filenames
        next if $thing =~ /([\0-\x1F])/;   # Perl built-ins come with non-printable control characters

        my $sFullPath = $package . $thing;
        maybe_print_sub_info($sFullPath, $thing); 

        if (defined ${$sFullPath}) {
            my $value = ${$sFullPath};
            print_tag("\$$thing", "scalar", '_', '_', '', $value);
        } elsif (@{$sFullPath}) {
            my $value = join(',', map({ defined($_) ? $_ : "" } @{$sFullPath}));
            print_tag("\@$thing", "array", '_', '_', '', $value);
        } elsif (%{$sFullPath} ) {
            next if ($thing =~ /::/);
            # Hashes are usually large and unordered, with less interesting stuff in them. Reconsider printing values if you find a good use-case.
            print_tag("%$thing", "hash", '_', '_', '', '_');
        }
    }
}

sub populate_preloaded {
    foreach my $mod (qw(List::Util File::Spec Sub::Util Cwd)){
        # Ideally we'd use Module::Loaded, but it only became core in Perl 5.9
        my $file = $mod . ".pm";
        $file =~ s/::/\//g;
        push (@preloaded, $mod) if $INC{$file};
    }
}

sub dump_subs_from_modules {
    my $modules = shift;
    my $totalCount = 0;
    my %baseCount;
    my $baseRegex = qr/^(\w+::\w+)/;

    # Just in case we find too much stuff. Arbitrary limit of 100 elements per module, 200 fully loaded modules.
    # results in 10 fully loaded files in the server before we start dropping them on the ground because of the lru-cache
    # Test with these limits and then bump them up if things are working well 
    my $modLimit  = 100;
    my $nameSpaceLimit = 4000; # Applied to Foo::Bar 
    my $totalLimit = 20000; 
    INSPECTOR: foreach my $mod (@$modules){
        my $pkgCount = 0;
        next INSPECTOR if($mod =~ $baseRegex and $baseCount{$1} > $nameSpaceLimit);
        my $methods = lib_bs22::Class::Inspector->methods( $mod );
        #my $methods = lib_bs22::ClassInspector->functions( $mod ); # Less memory, but less accurate?

        # Sort because we have a memory limit and want to cut the less important things. 
        @$methods = sort { ($a =~ /^[A-Z][A-Z_]+$/) cmp ($b =~ /[A-Z][A-Z_]+$/) # Anything all UPPERCASE is at the end
                    || ($a =~ /^_/) cmp ($b =~ /^_/)  # Private methods are 2nd to last
                    || $a cmp $b } @$methods; # Normal stuff up front. Order doesn't really matter, but sort anyway for readability 

        foreach my $name (@$methods){
            next if $name =~ /^(F_|O_|L_)/; # The unhelpful C compiled things
            if (my $codeRef = $mod->can($name)) {
                # TODO: Differentiate functions vs methods. Methods come from here, but so do functions. Perl mixes the two definitions anyway.
                my $iRes = maybe_print_sub_info("${mod}::${name}", '', $codeRef);
                $pkgCount += $iRes;
                $totalCount += $iRes;
            }

            last INSPECTOR if $totalCount >  $totalLimit; 
            next INSPECTOR if $pkgCount >  $modLimit;
        }
        $baseCount{$1} += $pkgCount if ($mod =~ $baseRegex);
    }
    return;
}

sub filter_modules {
    my ($modules) = @_;

    # Some of these things I've imported in here, some are just piles of C code.
    # We'll still nav to modules and find anything explictly imported so we can be aggressive at removing these. 
    my @to_remove = ("Cwd", "B", "main","version","POSIX","Fcntl","Errno","Socket", "DynaLoader","CORE","utf8","UNIVERSAL","PerlIO","re","Internals","strict","mro","Regexp",
                      "Exporter","Inquisitor", "XSLoader","attributes", "Sub::Util","warnings","strict","utf8","File::Spec","List::Util", "constant","XSLoader");

    # Exporter:: should remove Heavy and Tiny,  Moose::Meta is removed just because it drops more than 1500 things and I don't care about any of them
    my $filter_regex = qr/^(File::Spec::|warnings::register|::lib_bs22::|Exporter::|Moose::Meta::|Class::MOP::)/; # TODO: Allow keeping some of these
    my %filter = map { $_ => 1 } @to_remove;
    foreach (@preloaded) { $filter{$_} = 0 }; 
    my @filtered = grep { !$filter{$_} and $_ !~ $filter_regex} @$modules;
    return \@filtered;
}

sub dump_loaded_mods {
    my @modules;

    foreach my $module (keys %INC) {
        my $display_mod = $module;
        $display_mod =~ s/[\/\\]/::/g;
        $display_mod =~ s/(?:\.pm|\.pl)$//g;
        next if $display_mod =~ /lib_bs22::|^(Inquisitor|B)$/;
        my $path = $INC{$module};
        push @modules, $display_mod if lib_bs22::Class::Inspector->loaded($display_mod);
        print_tag("$display_mod", "mod", $path, $display_mod, 0, "_");
    }
    return \@modules;
}


1;

