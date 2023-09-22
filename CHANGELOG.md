# Changelog


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
