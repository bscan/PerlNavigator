/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import * as child_process from 'child_process';
import { workspace, ExtensionContext, tests, TestRunProfileKind, TestItem, TestMessage, Location, TestTag, Position } from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('server', 'dist', 'serverMain.js')
	);
	// The debug options for the server
	// --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
	const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: debugOptions
		}
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for perl documents
		documentSelector: [
			{ scheme: 'file', language: 'perl' },
			{ scheme: 'untitled', language: 'perl' }
		],
		synchronize: {
			configurationSection: 'perlnavigator',
			// Notify the server about file changes to '.clientrc files contained in the workspace
			// fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'perlnavigator',
		'Perl Navigator LSP',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();
	
	const ctrl = tests.createTestController('perlNavigator', 'Perl Navigator');
	context.subscriptions.push(ctrl);

	const fileTag = new TestTag('file');
	// Run profile for .t files marked with above tag
	ctrl.createRunProfile('Suite', TestRunProfileKind.Run, (request) => {
		let fileItems: ReadonlyArray<TestItem>;
		// Play button clicked on a specific test
		if (request.include && request.include.length > 0) {
			fileItems = request.include;
		}
		// Run tests button for all
		else {
			fileItems = [...ctrl.items].map(([_, testItem]) => testItem);
		}

		for (const fileItem of fileItems) {
			fileItem.canResolveChildren = true;
			const run = ctrl.createTestRun(request, fileItem.uri.fsPath);
			run.started(fileItem);
			// Extract via Test2::API to JSON
			const execPromise = new Promise((resolve, reject) => {
				child_process.exec(`perl -e '
					use Test2::API qw<intercept>;
					use JSON::PP qw<encode_json>;

					my $events = intercept {
						do $ARGV[0];
					};

					print encode_json($events->squash_info->flatten);	
				' ${fileItem.uri.fsPath}`, (error, stdout, stderr) => {
					if (stderr) {
						console.log(stderr);
					}
					if (error) {
						console.log(error.message);
					}
					if (stdout) {
						console.log(stdout);
						try {
							const data = JSON.parse(stdout);
							resolve(data);
						} catch (e) {
							console.error('Error parsing JSON:', e);
						}
					}
				});
			});
			execPromise.then((data) => {
				let count = 1;
				for (const obj of data as any[]) {
					console.log(obj);
					if (obj.hasOwnProperty('pass')) {
						const item = ctrl.createTestItem(`${fileItem.uri.fsPath}:${count}`, obj.name, fileItem.uri);
						fileItem.children.add(item);
						if (obj.pass === 1) {
							run.passed(item);
							run.appendOutput(`ok ${count} - ${obj.name}\n`, new Location(fileItem.uri, new Position(obj.trace_line - 1, 0)), item);
						}
						else {
							run.failed(item, obj.diag.map((msg) => new TestMessage(msg)));
							run.appendOutput(`not ok ${count} - ${obj.name}\n`, new Location(fileItem.uri, new Position(obj.trace_line - 1, 0)), item);
						}
						count++;
					}
				}
				run.end();
			});
		}
	}, true, fileTag);

	// Detect all .t files and create TestItems for them
	workspace.findFiles('**/*.t').then((files) => {
		for (const file of files) {
			const testItem = ctrl.createTestItem(file.fsPath, file.fsPath, file);
			testItem.tags = [fileTag],
			ctrl.items.add(testItem);
		}
	});
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
