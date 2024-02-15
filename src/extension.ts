import * as vscode from 'vscode';

interface Annotation {
	start: number;
	end: number;
	color?: string;
	text?: string;
};

function createDecoration(color: string): vscode.TextEditorDecorationType {
	let colorVal: string | object = color;
	if (color.startsWith("default")) {
		let idx = parseInt(color.substring("default".length)) || 0;
		colorVal = { id: 'annotate_me.defaultColor' + idx };
	}
	return vscode.window.createTextEditorDecorationType({
		borderWidth: '1px',
		borderStyle: 'solid',
		backgroundColor: colorVal,
		borderColor: '#ffffff50',
	});
}

const decorationTypeByColor = new Map<string, vscode.TextEditorDecorationType>();
const decorationsByType = new Map<vscode.TextEditorDecorationType, vscode.DecorationOptions[]>();
// For early optimization, only parse the regex on lines starting with those characters
// (first non whitespace character)
const annotationCommentCharacters = ['/', '#', '*'];
const annotationRegEx = /\@annotate\s*\[([0-9]+)\s*\-\s*([0-9]+)\]\s*(?:\[([#a-zA-Z0-9]+)\])?\s*(.*)/;

export function activate(context: vscode.ExtensionContext) {
	let activeEditor = vscode.window.activeTextEditor;

	let disposable = vscode.commands.registerCommand('annotate-me.annotate', () => {
		if (!activeEditor) {
			vscode.window.showWarningMessage('No active window');
			return;
		}

		const selection = activeEditor.selection;
		if (selection?.isEmpty) {
			vscode.window.showWarningMessage('Nothing is selected');
			return;
		}

		const selectionLine = selection.start.line;
		let snippetStartCharacter = selection.start.character;
		let snippetEndCharacter = selection.end.character;
		if (selection.start.line != selection.end.line) {
			// Multi line snippets are currently not supported, just use the rest of first line
			snippetEndCharacter = activeEditor.document.lineAt(selectionLine).text.length;
		}
		const selectionRange = new vscode.Range(selectionLine, snippetStartCharacter, selectionLine, snippetEndCharacter);
		const snippet = new vscode.SnippetString(`# @annotate [${snippetStartCharacter}-${snippetEndCharacter}] $0\n`);

		// insert the annotation after any existing annotations to prevent changing their colors
		let snippetLine = selectionLine + 1;
		for (let i = snippetLine; i < activeEditor.document.lineCount; i++) {
			const line = activeEditor.document.lineAt(i);
			const firstChar = line.text[line.firstNonWhitespaceCharacterIndex];

			if (annotationCommentCharacters.includes(firstChar) && annotationRegEx.test(line.text)) {
				snippetLine++;
			} else {
				break;
			}
		}

		activeEditor.insertSnippet(snippet, new vscode.Position(snippetLine, 0));
		triggerUpdateDecorations(false);
	});
	context.subscriptions.push(disposable);

	disposable = vscode.languages.registerFoldingRangeProvider('*', {
        provideFoldingRanges(document, context, token) {
            let sectionStart = undefined;
			let FR = [];

            for (let i = 0; i < document.lineCount; i++) {
				const line = document.lineAt(i);
				const firstChar = line.text[line.firstNonWhitespaceCharacterIndex];

				if (annotationCommentCharacters.includes(firstChar) && annotationRegEx.test(line.text)) {
                    if (sectionStart === undefined) {
                    	sectionStart = i == 0 ? 0 : i - 1;
					}
                } else if (sectionStart !== undefined) {
					FR.push(new vscode.FoldingRange(sectionStart, i - 1, vscode.FoldingRangeKind.Comment));
					sectionStart = undefined;
				}
            }
            if (sectionStart !== undefined) {
				FR.push(new vscode.FoldingRange(sectionStart, document.lineCount - 1, vscode.FoldingRangeKind.Comment));
			}

            return FR;
        }
    });
	context.subscriptions.push(disposable);

	function updateDecorations() {
		if (!activeEditor) {
			return;
		}
		const smallNumbers: vscode.DecorationOptions[] = [];

		let pending_annotations: Annotation[] = [];
		for (let i = 0; i < activeEditor.document.lineCount; i++) {
			const line = activeEditor.document.lineAt(i);
			const firstChar = line.text[line.firstNonWhitespaceCharacterIndex];
			if (annotationCommentCharacters.includes(firstChar)) {
				const re = new RegExp(annotationRegEx, annotationRegEx.flags);
				const match = re.exec(line.text);
				if (match?.length && match?.length > 3) {
					if (match.length >= 3) {
						pending_annotations.push({ start: parseInt(match[1]), end: parseInt(match[2]), color: match[3], text: match[4] });
					}
				}
			} else if (pending_annotations.length > 0) {
				let defColorIdx = 0;
				for (const annotation of pending_annotations) {
					const startPos = line.range.start.translate(-pending_annotations.length - 1, annotation.start);
					const endPos = line.range.start.translate(-pending_annotations.length - 1, annotation.end);
					let decoration: vscode.DecorationOptions = { range: new vscode.Range(startPos, endPos) };
					if (annotation.text) {
						const markdown = new vscode.MarkdownString(annotation.text, true);
						markdown.isTrusted = true;
						decoration.hoverMessage = markdown;
					}
					let color = annotation.color || ('default' + defColorIdx);

					let decorationType = decorationTypeByColor.get(color);
					if (!decorationType) {
						decorationTypeByColor.set(color, createDecoration(color));
						decorationType = decorationTypeByColor.get(color)!;
						decorationsByType.set(decorationType, []);
					}
					let decorations = decorationsByType.get(decorationType)!;
					decorations.push(decoration);
					defColorIdx = ((defColorIdx + 1) % 8);
				}
				pending_annotations.length = 0;
			}
		}

		for (const [type, decorations] of decorationsByType) {
			activeEditor.setDecorations(type, decorations);

			// prepare for the next iterations
			if (decorations.length > 0) {
				// make sure this decoration is cleared on next run
				decorationsByType.set(type, []);
			} else {
				// remove from the global map so we're not leaking memory
				decorationsByType.delete(type);
				for (const [icolor, itype] of decorationTypeByColor) {
					if (itype == type) {
						decorationTypeByColor.delete(icolor);
					}
				}
			}
		}
	}

	let timeout: NodeJS.Timeout | undefined = undefined;
	function triggerUpdateDecorations(throttle = false) {
		if (timeout) {
			clearTimeout(timeout);
			timeout = undefined;
		}
		if (throttle) {
			timeout = setTimeout(updateDecorations, 500);
		} else {
			updateDecorations();
		}
	}

	if (activeEditor) {
		triggerUpdateDecorations();
	}

	vscode.window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		if (editor) {
			triggerUpdateDecorations();
		}
	}, null, context.subscriptions);

	vscode.workspace.onDidChangeTextDocument(event => {
		if (activeEditor && event.document === activeEditor.document) {
			triggerUpdateDecorations(true);
		}
	}, null, context.subscriptions);
}

export function deactivate() {
	let activeEditor = vscode.window.activeTextEditor;

	for (const [type, decorations] of decorationsByType) {
		activeEditor?.setDecorations(type, []);
	}

	decorationTypeByColor.clear();
	decorationsByType.clear();
}
