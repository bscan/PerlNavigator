# Perl Navigator Language Server
Provides syntax checking, autocompletion, perlcritic, code navigation, hover for Perl.

Implemented as a Language Server using the Microsoft LSP libraries along with Perl doing the syntax checking and parsing.  

Works on Windows, MacOS, and Linux. The vscode extension includes everything needed to work, no additional installation should be necessary.
Works on almost any version of Perl, tested all the way back to Perl 5.8. Has full support for multi-root workspaces, single file editing, and multiple open windows.


## Currently Implemented Features:
* Syntax Checking
* Perl Critic static code analysis/suggestions
* Smart context-aware autocompletion and navigation
* Code Navigation ("Go To Definition") anywhere, including to installed modules and compile-time dependencies
* Outline view
* Hover for more details about objects, subs, and modules
* Does not write any cache directories or temp files.
* Works well with single files and large multi-folder workspaces
* Support for Classes including Moo/Moose style classes

## Visual Studio Code Demo

![gif of Navigator in vscode](https://raw.githubusercontent.com/bscan/PerlNavigator/main/Demo.gif)


## Vscode Installation
Install the VSCode extension and it should just work. All required dependencies are bundled with the extension. 
Please file a bug report if the Perl Navigator does not work out of the box.
Perl::Critic is not currently bundled and needs to be installed separately, but the remaining features (e.g. navigation, autocomplete, syntax check) do not require it.


### Perl paths
If you have a nonstandard install of Perl, please set the setting "perlnavigator.perlPath"
You can also add additional include paths that will be added to the perl search path (@INC) via "perlnavigator.includePaths" 


### Customizable Perl Critic severities
The default severities are reasonable, but you can change "perlnavigator.severity1" through severity5. Allowable options are error, warning, info, and hint.


## Install For Other Editors
Currently, this is not yet packaged for other editors but you can build from source. You'll need to have node.js and npm installed.
```
git clone https://github.com/bscan/PerlNavigator.git
cd PerlNavigator
npm install
```
Sublime Text requires the following minimum settings under LSP settings (modify depending on your install location and editor)
```
{
    "clients": {
        "perlnavigator": {
            "enabled": true,
            "command": ["node", "C:\\temp\\PerlNavigator\\server\\out\\server.js","--stdio"],
            "selector": "source.perl",
        },
    }
}
```

![gif of Navigator in sublime](https://raw.githubusercontent.com/bscan/PerlNavigator/main/images/Sublime.gif)


## Licenses / Acknowledgments
The Perl Navigator is free software licensed under the MIT License. It has a number of bundled dependencies as well, all of which have their respective open source licenses included.
This work is only possible due to Class::Inspector, Devel::Symdump, Perl::Critic, PPI, Sub::Util, Perl itself, Microsoft LSP libraries, and ideas from Perl::LanguageServer and PLS.
