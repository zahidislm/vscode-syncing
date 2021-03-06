import * as vscode from "vscode";

import { Gist, Syncing, VSCodeSetting } from "./core";
import * as Toast from "./core/Toast";
import { localize, setup } from "./i18n";
import { ISyncedItem } from "./types/SyncingTypes";

let _syncing: Syncing;
let _vscodeSetting: VSCodeSetting;
let _isSynchronizing: boolean;

export function activate(context: vscode.ExtensionContext)
{
    _init(context);
}

/**
 * Init.
 */
function _init(context: vscode.ExtensionContext)
{
    // Config i18n.
    setup(context.extensionPath);

    _isSynchronizing = false;
    _syncing = Syncing.create();
    _vscodeSetting = VSCodeSetting.create();

    _initCommands(context);
}

/**
 * Init the extension's commands.
 */
function _initCommands(context: vscode.ExtensionContext)
{
    _registerCommand(context, "syncing.uploadSettings", _uploadSettings);
    _registerCommand(context, "syncing.downloadSettings", _downloadSettings);
    _registerCommand(context, "syncing.openSettings", _openSettings);
}

/**
 * VSCode's registerCommand wrapper.
 */
function _registerCommand(context: vscode.ExtensionContext, command: string, callback: () => void)
{
    // Add to a list of disposables which are disposed when this extension is deactivated.
    context.subscriptions.push(vscode.commands.registerCommand(command, callback));
}

/**
 * Uploads your settings.
 */
async function _uploadSettings()
{
    if (!_isSynchronizing)
    {
        _isSynchronizing = true;
        try
        {
            const syncingSettings = await _syncing.prepareUploadSettings(true);
            const api = Gist.create(syncingSettings.token, _syncing.proxy);
            const settings = await _vscodeSetting.getSettings(true, true);
            const gist = await api.findAndUpdate(syncingSettings.id, settings, true, true);
            if (gist.id !== syncingSettings.id)
            {
                await _syncing.saveSettings({ ...syncingSettings, id: gist.id });
            }
            Toast.statusInfo(localize("toast.settings.uploaded"));
        }
        catch (error) { }
        finally
        {
            _isSynchronizing = false;
        }
    }
}

/**
 * Downloads your settings.
 */
async function _downloadSettings()
{
    if (!_isSynchronizing)
    {
        _isSynchronizing = true;
        try
        {
            const syncingSettings = await _syncing.prepareDownloadSettings(true);
            const api = Gist.create(syncingSettings.token, _syncing.proxy);
            try
            {
                const gist = await api.get(syncingSettings.id, true);
                const syncedItems = await _vscodeSetting.saveSettings(gist.files, true);
                Toast.statusInfo(localize("toast.settings.downloaded"));
                if (_isExtensionsSynced(syncedItems))
                {
                    Toast.showReloadBox();
                }
            }
            catch ({ code })
            {
                if (code === 401)
                {
                    _syncing.clearGitHubToken();
                }
                else if (code === 404)
                {
                    _syncing.clearGistID();
                }
            }
        }
        catch (error) { }
        finally
        {
            _isSynchronizing = false;
        }
    }
}

/**
 * Opens the Syncing's settings file in a VSCode editor.
 */
function _openSettings()
{
    _syncing.openSettings();
}

/**
 * Determines whether the extensions are actually synchronized.
 */
function _isExtensionsSynced(syncedItems: { updated: ISyncedItem[], removed: ISyncedItem[] }): boolean
{
    for (const item of syncedItems.updated)
    {
        if (item.extension && (
            item.extension.added.length > 0
            || item.extension.removed.length > 0
            || item.extension.updated.length > 0)
        )
        {
            return true;
        }
    }
    return false;
}
