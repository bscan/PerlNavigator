
# How to Contribute

Thanks for the interest in contributing. I highly encourage people to contribute to this project if they're interested.
If you want to discuss any features, feel free to file an issue or find me on discord or Reddit. 
In general, I welcome issues and pull requests. I may not get to all the issues as this is a personal project, but they're good to track.

## Beginner issues

Check out the issue tracker. Issues tagged "Good First Issue" should be relatively straightfoward. The issues tagged "Help Wanted" are typically slightly trickier and require more specialized knowledge of either Perl or Typescript and would be a huge help. Feel free to reach out if any ticket interests you.


## Architecture
The Perl Navigator is roughly half in typescript and half in Perl. To run only the Perl side itself, check the Perl Navigator logs in VSCode. It will show the example command for testing a file. 
The key command will look something like `perl -c -I /home/brian/.vscode-server/extensions/bscan.perlnavigator-0.3.0/server/src/perl -MInquisitor /tmp/msg_test.pl`
If you run this command by itself, you can see how the typescript side and the perl side interface with each other. The output of this command will include all the diagnostics in addition to a set of tags relevant to the file under consideration. 
