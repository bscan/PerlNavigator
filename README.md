# Perl Navigator
Extension for Perl that includes syntax checking, perlcritic, and code navigation. 

Implemented as a Language Server using the Microsoft LSP libraries along with Perl doing the syntax checking and parsing.  

Works on Windows, MacOS, and Linux. The vscode extension includes everything needed to work, no additional installation should be necessary.
Has support for multi-root workspaces, single file editing, and multiple open windows.


## Currently Implemented Features:
* Syntax Checking
* Perl Critic static code analysis/suggestions
* Code Navigation ("Go To Definition")
* Supports "Go To Definition" anywhere, including to any installed Perl modules or compile-time dependencies.
* Works well with single files and large multi-folder workspaces

## Installation
Install the VSCode extension and it should just work. All required dependencies are bundled with the extension. 
Please file a bug report if the Perl Navigator does not work out of the box.


### Perl paths
If you have a nonstandard install of Perl, please set the settings "perlnavigator.perlPath" and "perlnavigator.perlcriticPath"
You can also add additional include paths that will be added to the perl search path (@INC) via "perlnavigator.includePaths" 


### Customizable Perl Critic severities
The default severities are reasonable, but you can change "perlnavigator.severity1" through severity5. Allowable options are error, warning, info, and hint.
