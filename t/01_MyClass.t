use strict;
use warnings;
use Capture::Tiny qw( capture );
use Test::More import => [qw( done_testing is )];

# Need to pass some signal to inquistor to not run during its CHECK block. Alternatively, maybe we can check for the test harness environment variable?
BEGIN { $ENV{'PERLNAVIGATORTEST'} = 1; }

use FindBin qw( $Bin );
use lib "$Bin/../server/src/perl";
use Inquisitor ();


my $testFile = File::Spec->rel2abs("$Bin/../testWorkspace/MyLib/MyClass.pm");
my $output = capture(sub { Inquisitor::run($testFile) });
my $symbols = Inquisitor::tags_to_symbols($output);

is($symbols->{'overridden_method'}->[0]->{'type'}, 's', 'Basic sub');
is($symbols->{'overridden_method'}->[0]->{'line'}, '11;14', 'Sub boundaries');

done_testing;