/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as path from 'path';
import * as child_process from 'child_process';
import { workspace, ExtensionContext, tests, TestRunProfileKind, TestMessage } from 'vscode';

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
	
	const controller = tests.createTestController('perlTestController', 'Perl Test Controller');
	context.subscriptions.push(controller);
	
	workspace.findFiles('**/*.t').then((files) => {
		for (const file of files) {
			const testItem = controller.createTestItem(file.fsPath, file.fsPath, file);
			controller.items.add(testItem);
		}
	});
	
	controller.createRunProfile('Run Tests', TestRunProfileKind.Run, (request, token) => {
		const run = controller.createTestRun(request);
	
		for (const test of request.include) {
			run.started(test);
	
			child_process.exec(`prove ${test.uri.fsPath}`, (error, stdout, stderr) => {
				if (error) {
					run.failed(test, new TestMessage(`Error: ${error.message}`));
				} else if (stderr) {
					run.failed(test, new TestMessage(`Error: ${stderr}`));
					run.appendOutput(stderr, undefined, test);
				} else {
					run.passed(test);
				}
				run.appendOutput(stdout, undefined, test);
	
				run.end();
			});
		}
	}, true)

	// Create the language client and start the client.
	client = new LanguageClient(
		'perlnavigator',
		'Perl Navigator LSP',
		serverOptions,
		clientOptions
	);

	// Start the client. This will also launch the server
	client.start();
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
