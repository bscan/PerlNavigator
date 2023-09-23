
# How to Contribute

Thanks for the interest in contributing. I highly encourage people to contribute to this project if they're interested.
If you want to discuss any features, feel free to file an issue or find me on discord or Reddit. 
In general, I welcome issues and pull requests. I may not get to all the issues as this is a personal project, but they're good to track.

## Beginner issues

Check out the issue tracker. Issues tagged "Good First Issue" should be relatively straightfoward. The issues tagged "Help Wanted" are typically slightly trickier and require more specialized knowledge of either Perl or Typescript and would be a huge help. Feel free to reach out if any ticket interests you.

## Architecture
The Perl Navigator is roughly half in typescript and half in Perl. 
The Language Server piece is the most important piece, but the vscode extension also includes additional TextMate grammar based syntax highlighting enhancements.


## Testing Perl-only changes
To run only the Perl side itself, check the Perl Navigator logs in VSCode. It will show the example command for testing a file. 
The key command will look something like `perl -c -I /home/brian/.vscode-server/extensions/bscan.perlnavigator-0.3.0/server/src/perl -MInquisitor /tmp/msg_test.pl`
If you run this command by itself, you can see how the typescript side and the perl side interface with each other. The output of this command will include all the diagnostics in addition to a set of tags relevant to the file under consideration. 

# Testing the Perl Navigator
If you want to run a full environment of the Navigator, you can check out the repo and use the built-in Run configurations. The navigator was originally a clone of the Microsoft language server example from here: https://github.com/microsoft/vscode-extension-samples/tree/main/lsp-sample and includes the run configurations from it. It pops open a new window running the extension. For additional information, see the lsp-sample repo or feel reach out to me.


## Building For VSCode/VSCodium
You don't need to build the extension to be able to test and develop. 
In addition to node.js and npm you will have to install [vsce](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#vsce), a tool for packaging (among other things) extensions in the .vsix format used by both VSCode and VSCodium by running the following:
```sh
git clone https://github.com/bscan/PerlNavigator
cd PerlNavigator/
npm install -g @vscode/vsce
vsce package
```
At this point all that's left to do is install the resulting .vsix file (located in the current directory) in VSCode or VSCodium by navigating to the Extensions pane and choosing "Install from VSIX...".
