# Changelog

## 0.7.2 2023-10-15
- Leveraging the new parser for variety of features:
- Subroutine signatures visible while typing, and on hover (includes support for methods, corinna, etc)
- Navigation improved by just-in-time parsing. Fixes off-by-one line errors and Moo attributes.
- Foo::Bar->new(...)->func is now recognized as Foo::Bar->func()
- Thank you to IAKOBVS for code reviews and pull requests with speed improvements, readability improvement, and bug fixes 

## 0.7.1 2023-10-09
- Migrating browser version to new parser. Still not unified, but much closer.

## 0.7.0 2023-10-09
- No new features, no new bugs 🤞.
- Large refactor of the tagger. Migrated from Perl to Typescript. This should enable a variety of features moving forward that require a Perl parser. 
- Now depends on TextMate grammars as implemented using Oniguruma in WebAssembly

## 0.6.3 2023-09-23
- Allow server to be installed with npm i -g perlnavigator-server


## 0.6.2 2023-09-21
- Support for Dancer/Dancer2 with syntax highlighting and detection of HTTP routes as symbols
- Bug fix to show "is not exported by" syntax errors on the line where the module is imported


## 0.5.9 2023-07-09
- Support for perlParams which helps with Carton, Docker, Carmel support, etc. Thanks @marlencrabapple https://github.com/bscan/PerlNavigator/pull/68


## 0.5.8 2023-07-08
- Better support for use feature 'class': improved navigation, syntax highlighting fixes, critic on :param, critic on :isa()
- Fix "blinking" of diagnostics from multiple simulatenous runs
- Navigate to main::foo style functions
- Support for one configuration of AUTOLOAD function
- Moo/Moose syntax highlighting bug


## 0.5.8 2023-07-08
- Allow logging from editors other than vscode


## 0.5.5 2023-03-18
- Get perlcritic working on Object::Pad and the new class feature;


## 0.5.1 2023-01-16
- Adding features to web extension: outline view, hover, completion, go-to definition (currently all within same file)


## 0.5.0 2023-01-15
- First version of web extension for vscode.dev. Extremely limited feature set in webmode
- Fixed file display in syntax errors
- Perlcritic configuration options in settings (e.g. severity)
- Fix perl critic for async and method by adjusting code prior to PPI


## 0.4.9 2023-01-14
- Make perltidy and critic run fully async to help with progress messages


## 0.4.7 2023-01-07
- Syntax highlighting for feature 'class', version strings, state, isa, try/catch


## 0.4.1 2022-11-28
- For full change history, see github tickets
- Perlimports
- Syntax highlighting for Moose, Object::Pad, Async/Await
- Better outline support for object::pad, zydeco, async, function::params, etc
- Added support for untitled documents
- Compilation improvements for circular references
- Fix comment removal in tagging for better outline view


## 0.2.7 2022-02-27

- Adding this changelog
- Perl::Tidy support
- Use a default Perl::Critic profile if you don't have one specified
- Navigation to modules included via "require"
- Better autocomplete for Objects
- Emacs support via a settings fix
