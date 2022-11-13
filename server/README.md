
# Perl Navigator Language Server
Provides syntax checking, autocompletion, perlcritic, code navigation, hover for Perl.

Implemented as a Language Server using the Microsoft LSP libraries along with Perl doing the syntax checking and parsing.  

## Currently Implemented Features:
* Syntax Checking
* Perl Critic static code analysis/suggestions
* Smart context-aware autocompletion and navigation
* Code Navigation ("Go To Definition") anywhere, including to installed modules and compile-time dependencies
* Code formatting via Perl::Tidy
* Imports cleanup via perlimports 
* Outline view
* Hover for more details about objects, subs, and modules
* Syntax highlighting for Object::Pad, Moose, Zydeco, etc.
* Support for Classes including Moo/Moose style classes

See full documentation and installation instructions at: https://github.com/bscan/PerlNavigator 
