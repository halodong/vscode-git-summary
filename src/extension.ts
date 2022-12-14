import * as vscode from 'vscode'
import gitDiffParser from 'gitdiff-parser'
import TreeDataProvider, { getElementByName, getElements, handleSummaryCommand } from './tree'
import { getDiffFileLines, getDiffSummaryDesc, getGitApi } from './tool'

let statusBarItem: vscode.StatusBarItem
export let provider: TreeDataProvider

enum Commands {
  summary = 'git-summary',
  refresh = 'git-summary.refresh',
}

export async function activate(ctx: vscode.ExtensionContext) {
  console.log('vscode-git-summary is active!')

  const { subscriptions } = ctx
  const gitApi = await getGitApi()
  provider = new TreeDataProvider(ctx)
  vscode.window.registerTreeDataProvider('git-summary', provider)

  function refreshTree() {
    provider.clear()
    let root = vscode.workspace.getConfiguration('git-summary').rootFolder
    if (root === '') {
      if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        root = vscode.workspace.workspaceFolders[0].uri.fsPath
      } else {
        return
      }
    }
    const repos = gitApi.repositories

    repos[0]?.diff().then((res) => {
      if (res.length === 0) {
        // no change
      } else {
        const diffList = gitDiffParser.parse(res)

        diffList.forEach((d) => provider.add(root, d))
        console.log('diff-----------', diffList, root)
      }
      updateStatusBarItem()
    })
  }

  vscode.commands.registerCommand('git-summary.reveal', (file, line) => {
    vscode.workspace.openTextDocument(file).then(function (document) {
      vscode.window.showTextDocument(document).then(function (editor) {
        const position = new vscode.Position(line, 0)
        editor.selection = new vscode.Selection(position, position)
        editor.revealRange(editor.selection, vscode.TextEditorRevealType.Default)
        vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup')
      })
    })
  })
  const repos = gitApi.repositories
  if (repos[0]) {
    subscriptions.push(repos[0].state.onDidChange(refreshTree))
  }
  subscriptions.push(vscode.commands.registerCommand(Commands.refresh, refreshTree))
  subscriptions.push(vscode.workspace.onDidSaveTextDocument(refreshTree))
  refreshTree()

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10000)
  statusBarItem.command = Commands.summary
  subscriptions.push(vscode.commands.registerCommand(Commands.summary, handleSummaryCommand))
  subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusBarItem))
}

async function updateStatusBarItem(): Promise<void> {
  const gitApi = await getGitApi()
  const repos = gitApi.repositories
  if (repos[0]) {
    const activeTextEditor = vscode.window.activeTextEditor
    if (activeTextEditor) {
      const rootUrl = repos[0].rootUri.path
      const targetUrl = activeTextEditor.document.uri.path
      const p = targetUrl.substring(rootUrl.length + 1)

      const els = getElements()
      if (els.length === 0) {
        statusBarItem.text = '$(megaphone) diff no change'
      } else {
        const el = getElementByName(p)
        if (el) {
          const changeLines = getDiffFileLines(el)
          statusBarItem.text = `$(megaphone) ${getDiffSummaryDesc(changeLines)}`
        } else {
          statusBarItem.text = '$(megaphone) untracked'
        }
      }

      statusBarItem.show()
    }
  }
}
