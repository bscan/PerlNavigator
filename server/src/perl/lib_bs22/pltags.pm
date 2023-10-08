package pltags;

# pltags - create a tags file for Perl code

# Originally written by Michael Schaap <pltags@mscha.com>.
# Modified for use in the Perl Navigator by bscan https://github.com/bscan
# Some code leveraged from Perl::Tags::Naive https://metacpan.org/pod/Perl::Tags::Naive


# Complain about undeclared variables
use strict;
no warnings;
use utf8;
use Text::Balanced ();

use Exporter;
our @ISA    = qw(Exporter);
our @EXPORT_OK = qw(build_pltags);

# Global variables
my $VERSION = "2.4";    # pltags version

sub new {
    my $class = shift;
    my $self = {};
    bless $self, $class;
    return $self;
}


sub _init_file {
    my ($self, $code, $offset, $file) = @_;

    $self->{tags}     = [];      # List of produced tags
    $self->{packages} = [];    # List of discovered packages
    $self->{file}     = $file;

    $self->{package_name}  = "";
    $self->{offset} = $offset;

    my $line_number = -$offset;
        
    my @code = split("\n", $code);
    my $n = scalar(@code);
    my @codeClean;
    $self->{active} = {}; # Keep track of frameworks in use to keep down false alarms on field vs has vs attr

    # Loop through file
    for (my $i=0; $i<$n;$i++){
        $line_number++;

        my $line = $code[$i];

        $line = "" if $line_number < 0;

        # Skip pod. Applied before stripping leading whitespace
        $line = "" if ($line =~ /^=(?:pod|head|head1|head2|head3|head4|over|item|back|begin|end|for|encoding)/ .. $line =~ /^=cut/); 
        last if ($line =~ /^(__END__|__DATA__)\s*$/); 

        # Statement will be line with comments, whitespace and POD trimmed
        my $stmt;
        ($stmt = $line) =~ s/^\s*#.*//;
        $stmt =~ s/^\s*//;
        $stmt =~ s/\s*$//;

        push @codeClean, $stmt;
    }

    return \@codeClean;
}


sub build_pltags {
    my ($self, $code, $offset, $file) = @_;
    
    my $codeClean = $self->_init_file($code, $offset, $file);

    my $var_continues = 0;
    my $line_number = -$offset;
    my $n = scalar(@$codeClean);

    for (my $i=0; $i<$n;$i++){
        $line_number++;

        my $stmt = $codeClean->[$i];
        
        # Nothing left? Never mind.
        next unless ($stmt);
        if ($stmt =~ /^package\s+([\w:]+)/) {
            push(@{$self->{packages}}, $1);
        }

        # This is a class decoration for Object::Pad, Corinna, or Moops 
        elsif ($stmt =~ /^class\s+([\w:]+)/) {
            push(@{$self->{packages}}, $1);
        }
        
        # This is a role decoration for Object::Pad, Corinna, or Moops 
        elsif ($stmt =~ /^role\s+([\w:]+)/) {
            push(@{$self->{packages}}, $1);
        }
    }
    
    return $self->{tags}, $self->{packages};
}

1;