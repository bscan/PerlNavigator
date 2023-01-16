# Changelog

## 0.5.1 2022-01-16
- Adding features to web extension: outline view, hover, completion, go-to definition (currently all within same file)


## 0.5.0 2022-01-15
- First version of web extension for vscode.dev. Extremely limited feature set in webmode
- Fixed file display in syntax errors
- Perlcritic configuration options in settings (e.g. severity)
- Fix perl critic for async and method by adjusting code prior to PPI


## 0.4.9 2022-01-14
- Make perltidy and critic run fully async to help with progress messages


## 0.4.7 2022-01-07
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
