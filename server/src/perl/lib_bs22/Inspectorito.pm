package lib_bs22::Inspectorito;
# The Inspectorito, or "Little Inspector" is a subclass of Class::Inspector built for the perl navigator
# It overrides ->methods to only specify locally defined methods. Normally, all imported functions become methods on a class which pollutes the namespace.
# For example, if an object $foo uses the Data::Dumper internally, you can $foo->Dumper() on that object despite it not making any sense. 

# TODO: Test on Perl 5.8 without Sub::Util

use 5.006;
use strict qw{vars subs};
use warnings;
use File::Spec ();
use base qw(lib_bs22::Class::Inspector);
use vars qw{$VERSION $RE_IDENTIFIER $RE_CLASS $UNIX};

BEGIN {
    $VERSION = '1.28';

    SCOPE: {
        local $@;
        eval "require utf8; utf8->import";
    }

    # Predefine some regexs
    $RE_IDENTIFIER = qr/\A[^\W\d]\w*\z/s;
    $RE_CLASS      = qr/\A[^\W\d]\w*(?:(?:\'|::)\w+)*\z/s;

    # Are we on something Unix-like?
    $UNIX  = !! ( $File::Spec::ISA[0] eq 'File::Spec::Unix'  );

    eval {
        require Sub::Util;
        Sub::Util->import('subname');
    }
}





sub local_methods {
    my $class     = shift;
    my $name      = $class->_class( shift ) or return undef;
    my @arguments = map { lc $_ } @_;

    # Only works if the class is loaded
    return undef unless $class->loaded( $name );

    # Get the super path ( not including UNIVERSAL )
    # Rather than using Class::ISA, we'll use an inlined version
    # that implements the same basic algorithm.
    my @path  = ();
    my @queue = ( $name );
    my %seen  = ( $name => 1 );
    while ( my $cl = shift @queue ) {
        push @path, $cl;
        unshift @queue, grep { ! $seen{$_}++ }
            map { s/^::/main::/; s/\'/::/g; $_ }
            ( @{"${cl}::ISA"} );
    }

    #print "Now inspecting @path\n";
    # Find and merge the function names across the entire super path.
    # Sort alphabetically and return.
    my %methods = ();
    foreach my $namespace ( @path ) {
        my @functions = grep { ! $methods{$_} }
            grep { /$RE_IDENTIFIER/o }
            grep { defined &{"${namespace}::$_"} } 
            keys %{"${namespace}::"};
        
        foreach my $func ( @functions ) {
            if (my $codeRef = $namespace->can($func)) {
                my $source = subname( $codeRef );
                # print "Found $func in $namespace with source $source\n";
                next unless "${namespace}::$func" eq $source;
            } else {
                # What are these things?
                print "WARNING: Skipping $func";
                next;
            } 
            $methods{$func} = $namespace;
        }
    }

    # Filter to public or private methods if needed
    my @methodlist = sort keys %methods;

    \@methodlist;
}


1;