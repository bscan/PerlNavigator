package Inquisitor;

# be careful around importing anything since we don't want to pollute the users namespace
use strict;
use attributes;
no warnings; 
use File::Spec;

my @preloaded; # Check what's loaded before we pollute the namespace

my @checkPreloaded = qw(List::Util File::Spec Sub::Util Cwd Scalar::Util Class::Inspector Encode Encode::Config Encode::Alias Encode::Encoding
        Encode::utf8 Encode::UTF_EBCDIC Encode::XS Encode::MIME bytes Storable File::Basename parent Encode::MIME::Name);

# Mark warnings to detect difference between warnings and errors. Inspired by https://github.com/skaji/syntax-check-perl
$SIG{__WARN__} = sub { warn '=PerlWarning=', @_ };

# These modules can cause issues because they wipe the symbol table before we get a chance to inspect it.
# Prevent them from loading. 
# I hope this doesn't cause any issues, perhaps VERSION numbers or import statements would help here
#
# See https://perldoc.perl.org/perldelta#Calling-the-import-method-of-an-unknown-package-produces-a-warning
# for a discussion of why the stub imports are necessary as of Perl 5.40
$INC{'namespace/clean.pm'} = '';
$INC{'namespace/autoclean.pm'} = '';
{
    no strict 'refs';
    *{'namespace::autoclean::VERSION'} = sub { '0.29' };
    *{'namespace::clean::VERSION'} = sub { '0.27' };
    *{'namespace::autoclean::import'} = sub { };
    *{'namespace::clean::import'} = sub { };
}

CHECK {
    if(!$ENV{'PERLNAVIGATORTEST'}){
        run();
    }
}

sub run {
    print "Running inquisitor\n";
    my $sourceFilePath = shift;
    eval {
        load_test_file($sourceFilePath);
        populate_preloaded();
        load_dependencies();

        dump_loaded_mods();

        dump_vars_to_main("main");

        # This following one has the largest impact on memory and finds less interesting stuff. Low limits though, which probably helps
        my $allPackages = get_all_packages();
        $allPackages = filter_modpacks($allPackages); 
        dump_subs_from_packages($allPackages);

        my $packages = run_pltags($sourceFilePath);
        print "Done with pltags. Now dumping same-file packages\n";

        foreach my $package (@$packages){
            # This is finding packages in the file we're inspecting, and then dumping them into a single namespace in the file
            if ($package) {
                dump_vars_to_main($package);
                dump_inherited_to_main($package);
                tag_parents($package);
            }
        }
        1; # For the eval
    } or do {
        my $error = $@ || 'Unknown failure';
        print "PN:inquistor failed with error: $error\n";
    };
}

sub load_dependencies {
    require File::Basename;
    require File::Spec;
    require B;
    require Encode;
    my $module_dir = File::Spec->catfile( File::Basename::dirname(__FILE__), 'lib_bs22');
    unshift @INC, $module_dir; 
   
    # Sub::Util was added to core in 5.22. The real version can find module names of C code (e.g. List::Util). The fallback can still trace Pure Perl functions
    require SubUtilPP; 
    require Inspectorito;
    require Devel::Symdump;
}

sub load_test_file {
    # If we're in test mode for a .t file, we haven't loaded the file yet, so let's eval it to populate the symbol table
    my $filePath = shift;
    return if !$filePath;
    my ($source, $offset, $file) = load_source($filePath); 

    $source = "local \$0; BEGIN { \$0 = '${filePath}'; if (\$INC{'FindBin.pm'}) { FindBin->again(); };  }\n# line 0 \"${filePath}\"\nCORE::die('END_EARLY');\n$source";
    eval $source; ## no critic

    if ($@ eq "END_EARLY.\n"){
        return;
    } else {
        die("Rethrowing error from $filePath: ---$@---");
    }
}

sub maybe_print_sub_info {
    my ($sFullPath, $sDisplayName, $codeRef, $sSkipPackage, $subType) = @_;
    $subType = 't' if !$subType;
    my $UNKNOWN = "";

    if (defined &$sFullPath or $codeRef) {
        $codeRef ||= \&$sFullPath;

        my $meta = B::svref_2object($codeRef);
        $meta->isa('B::CV') or return 0;

        my ($file, $line, $subType) = resolve_file($meta, $subType, $codeRef);
        
        my $pack = $UNKNOWN;
        my $subname = $UNKNOWN;
        $subname = SubUtilPP::subname($codeRef);
        $pack = $1 if($subname =~ m/^(.+)::.*?$/);

        # Subname is a fully qualified name. If it's the normal name, just ignore it.
        $subname = '' if (($pack and $sSkipPackage and $pack eq $sSkipPackage) or ($pack eq 'main'));

        return 0 if $file =~ /([\0-\x1F])/ or $pack =~ /([\0-\x1F])/;
        return 0 if $file =~ /(Moo.pm|Exporter.pm)$/; # Objects pollute the namespace, many things have exporter

        if (($file and $file ne $0) or ($pack and $pack ne $sSkipPackage)) {
            # pltags will find everything in $0 / currentpackage, so only include new information.
            # Note: the above IF is breaking $self-> for Object::Pad for things that exist in current package.
            # Basically `field $writerField: writer;` is generating `set_writerField` which is then skipped.
            print_tag($sDisplayName || $sFullPath, $subType, $subname, $file, $pack, $line, '') ;
            return 1;
        }
    }
    return 0;
}

sub tag_parents {
    my $package = shift;

    no strict 'refs';
    my @parents = @{"${package}::ISA"};
    my $primaryGuardian = $parents[0];
    if($primaryGuardian){
        print_tag("$package", '2', $primaryGuardian, '', '', '', '');
    }
}

sub resolve_file {
    my ($meta, $subType, $codeRef) = @_;

    my $file = '';
    my $line = '';

    # Very few things are tagged method, but we can clean up autocomplete if it is. Can something be both an attribute and a attribute? Also, i and t both become x?
    $subType = 'x' if (grep /^method$/, attributes::get($codeRef));

    if ($meta->START->isa('B::COP')){
        $file = $meta->START->file;
        $line = $meta->START->line - 1;
    } elsif ($meta->GV->isa('B::GV') and $meta->GV->FILE =~ /Class[\\\/](?:XS)?Accessor\.pm$/){
        # If something comes from XSAccessor or Accessor, it's an attribute (e.g. Moo, ClassAccessor), but we don't know where in the Moo class it's defined.
        $subType = 'd';
    } elsif(UNIVERSAL::can($meta, 'FILE')){
        # Happens for Corinna methods
        my $testFile = $meta->FILE;

        if( $testFile !~ /Inquisitor\.pm/ ){
            # Are constants and other preprocessing things showing up in the inquistor???
            $file = $testFile;
        }
    }

    # Moose (but not Moo) attributes return this for a file.
    if ($file =~ /^accessor [\w:]+ \(defined at (.+) line (\d+)\)$/){
        $file = $1;
        $line = $2;
        $subType = 'd';
    }

    return ($file, $line, $subType);
}

sub print_tag {
    # Dump details to STDOUT. Format depends on type
    my ($symbol, $type, $typeDetails, $file, $pack, $line, $value) = @_;
    #TODO: strip tabs and newlines from all of these? especially value
    return if $value =~ /[\0-\x1F]/;
    $file = '' if $file =~ /^\(eval/;
    $line = 0 if ($line ne '' and $line < 0); 
    print "$symbol\t$type\t$typeDetails\t$file\t$pack\t$line\t$value\n";
}

sub run_pltags {
    require pltags;
    my $sourceFilePath = shift;
    my ($source, $offset, $file) = load_source($sourceFilePath);

    print "\n--------------Now Building the new pltags ---------------------\n";
    my $plTagger = pltags->new();
    my ($tags, $packages) = $plTagger->build_pltags($source, $offset, $file); # $0 should be the script getting compiled, not this module

    foreach my $newTag (@$tags){
        print $newTag . "\n";
    }
    return $packages
}

sub dump_vars_to_main {
    my ($package) = @_;
    no strict 'refs'; ## no critic
    my $fullPackage = "${package}::";

    foreach my $thing (sort keys %$fullPackage) {
        next if $thing =~ /^_</;           # Remove all filenames
        next if $thing =~ /([\0-\x1F])/;   # Perl built-ins come with non-printable control characters

        my $sFullPath = $fullPackage . $thing;
        maybe_print_sub_info($sFullPath, $thing, '', $package); 

        if (defined( my $value = eval {${$sFullPath}} ) ) {
            print_tag("\$$thing", "c", '', '', '', '', $value);
        }
        if (my $aref = *{$sFullPath}{'ARRAY'}) {
            next if $sFullPath =~ /^main::ARGV$/;
            # TODO: Check if aref is tied to prevent arbitrary functions from running
            my $value = join(', ', map({ defined($_) ? $_ : "" } eval { @$aref }));
            print_tag("\@$thing", "c", '', '', '', '', $value);
        }
        if (*{$sFullPath}{'HASH'} ) {
            next if ($thing =~ /::/);
            # Hashes are usually large and unordered, with less interesting stuff in them. Reconsider printing values if you find a good use-case.
            print_tag("%$thing", "h", '', '', '', '', '');
        }
    }
}

sub dump_inherited_to_main {
    my ($package) = @_;

    my $methods = Inspectorito->local_methods( $package );
    foreach my $name (@$methods){
        next if $name =~ /^(F_|O_|L_)/; # The unhelpful C compiled things
        if (my $codeRef = UNIVERSAL::can($package, $name) ) {
            my $iRes = maybe_print_sub_info("${package}::${name}", $name, $codeRef, $package, 'i');
        }
    }
}

sub populate_preloaded {
    # Populate preloaded modules before we pollute the symbol table. 
    foreach my $mod (@checkPreloaded){ 
        # Ideally we'd use Module::Loaded, but it only became core in Perl 5.9
        my $file = $mod . ".pm";
        $file =~ s/::/\//g;
        push (@preloaded, $mod) if $INC{$file};
    }
}

sub dump_subs_from_packages {
    my ($modpacks, $seen, $allowance) = @_;
    my $totalCount = 0;
    my %baseCount;
    my $baseRegex = qr/^(\w+)/;

    # Just in case we find too much stuff. Arbitrary limit of 100 subs per module, 200 fully loaded packages.
    # results in 10 fully loaded files in the server before we start dropping them on the ground because of the lru-cache
    # Test with these limits and then bump them up if things are working well 
    my $modLimit  = 150;
    my $nameSpaceLimit = 10000; # Applied to Foo in Foo::Bar 
    my $totalLimit = 30000; 
    INSPECTOR: foreach my $mod (@$modpacks){
        my $pkgCount = 0;
        next INSPECTOR if($mod =~ $baseRegex and $baseCount{$1} > $nameSpaceLimit);
        my $methods = Inspectorito->local_methods( $mod );
        next INSPECTOR if !defined($methods);
        #my $methods = ClassInspector->functions( $mod ); # Less memory, but less accurate?

        # Sort because we have a memory limit and want to cut the less important things. 
        @$methods = sort { ($a =~ /^[A-Z][A-Z_]+$/) cmp ($b =~ /[A-Z][A-Z_]+$/) # Anything all UPPERCASE is at the end
                    || ($a =~ /^_/) cmp ($b =~ /^_/)  # Private methods are 2nd to last
                    || $a cmp $b } @$methods; # Normal stuff up front. Order doesn't really matter, but sort anyway for readability 

        foreach my $name (@$methods){
            next if $name =~ /^(F_|O_|L_)/; # The unhelpful C compiled things
            if (my $codeRef = UNIVERSAL::can($mod, $name) ) {
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

sub filter_modpacks {
    my ($modpacks) = @_;

    # Some of these things I've imported in here, some are just piles of C code.
    # We'll still nav to modules and find anything explictly imported so we can be aggressive at removing these. 
    my @to_remove = ("if", "Cwd", "B", "main","version","POSIX","Fcntl","Errno","Socket", "DynaLoader","CORE","utf8","UNIVERSAL","PerlIO","re","Internals","strict","mro","Regexp",
                      "Exporter","Inquisitor", "XSLoader","attributes", "warnings","strict","utf8", "constant","XSLoader", "Carp", "Inspectorito", "SubUtilPP",
                      "base", "Config", "overloading", "Devel::Symdump", "vars", "Tie::Hash::NamedCapture", "Text::Balanced", "Filter::Util::Call", "IO::Poll", "IO::Seekable", "IO::Handle", 
                       "IO::File", "Symbol", "IO", "SelectSaver", "overload", "Filter::Simple", "SelfLoader", "PerlIO::Layer", "Text::Balanced::Extractor", "IO::Socket", @checkPreloaded);


    my %filter = map { $_ => 1 } @to_remove;

    # Exporter:: should remove Heavy and Tiny,  Moose::Meta is removed just because it drops more than 1500 things and I don't care about any of them
    my $filter_regex = qr/^(File::Spec::|warnings::register|lib_bs22::|Exporter::|Moose::Meta::|Class::MOP::|B::|Config::)/; # TODO: Allow keeping some of these
    my $private = qr/::_\w+/;

    foreach (@preloaded) { $filter{$_} = 0 }; 
    my @filtered = grep { !$filter{$_} and $_ !~ $filter_regex and $_ !~ $private} @$modpacks;

    # Sort by depth and then alphabetically. The assumption is that more nested things are less important.
    # Also, consistent sorting makes debugging easier.
    @filtered = sort {
        my $depth_a = $a =~ tr/:://;
        my $depth_b = $b =~ tr/:://;

        # First, sort by depth
        if ($depth_a != $depth_b) {
            return $depth_a <=> $depth_b;
        }

        # Second, sort alphabetically
        return $a cmp $b;
    } @filtered;


    return \@filtered;
}

sub dump_loaded_mods {
    my @modules = 
    my $displays = {};

    foreach my $module (keys %INC) {
        my $display_mod = $module;
        $display_mod =~ s/[\/\\]/::/g;
        $display_mod =~ s/(?:\.pm|\.pl)$//g;
        next if $display_mod =~ /lib_bs22::|^(Inquisitor|B)$/;
        next if !Inspectorito->loaded($display_mod);
        $displays->{$display_mod} = $INC{$module};
    }

    my $filtered_modules = filter_modpacks([keys %$displays]);

    foreach my $key_to_print (@$filtered_modules) {
        my $path = $displays->{$key_to_print};
        next if !$path; # If we don't have a path, the modHunter module would be better
        print_tag("$key_to_print", "m", "", File::Spec->rel2abs($path), $key_to_print, 0, "");
    }
    return;
}

sub get_all_packages {
    my $obj = Devel::Symdump->rnew();
    my @allPackages = $obj->packages;
    return \@allPackages;
}

sub load_source {
    my $sourceFilePath = shift; # Only set during testing.
    my ($source, $offset, $file);

    if($sourceFilePath){
        # Currently loading the source twice, which is a waste. TODO: Move some stuff around
        open my $fh, '<:utf8', $sourceFilePath or die "Can't open file $!"; ## no critic (UTF8)
        $file = $sourceFilePath;
        $source = do { local $/; <$fh> };
        $offset = 1;
        close($fh);
    } elsif ($INC{"lib_bs22/SourceStash.pm"}){
        # Path run during the extension
        $source = $lib_bs22::SourceStash::source;
        $file = $lib_bs22::SourceStash::filename;
        $source = Encode::decode('utf-8', $source);
        $offset = 3;
    } else{
        # Used for debugging the extension and shown to users in the log
        require File::Spec;
        # TODO: Adjust PLTags offset in this case.
        $file = File::Spec->rel2abs($0);
        open my $fh, '<:utf8', $file or die "Can't open file $!"; ## no critic (UTF8)
        $source = do { local $/; <$fh> };
        $offset = 1;
        close($fh);
    }
    $source = "" if !defined($source);
    return ($source, $offset, $file);
}

sub tags_to_symbols {
    # Currently only used for testing. Turns an output of tags into a hash of symbol array, similiar to ParseDocument.ts
    my $tags = shift;
    my $symbols = {};
    foreach my $tag_str (split("\n", $tags)){
        my @pieces =  split("\t", $tag_str, -1);
        if( scalar( @pieces ) == 7 ){
            my ($tag, $type, $typeDetails, $file, $package_name, $line) = @pieces;
            $symbols->{$tag} = [] if !exists($symbols->{$tag});
            push @{ $symbols->{$tag} }, {'type'=> $type, 'typeDetails' => $typeDetails, 'file'=>$file, 'package_name'=>$package_name, 'line'=>$line};
        } 
    }
    return $symbols;
}

1;

