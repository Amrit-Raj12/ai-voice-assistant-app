const { app } = require('electron')

function setupAutostart() {
    app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
        path: app.getPath('exe')
    })
}

function disableAutostart() {
    app.setLoginItemSettings({ openAtLogin: false })
}

module.exports = { setupAutostart, disableAutostart }