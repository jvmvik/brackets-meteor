define(function main(require, exports, module) {
    var PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        prefs = PreferencesManager.getExtensionPrefs("brackets-meteor");

    // Default settings
    prefs.definePreference("meteor-bin", "string", "");
    prefs.definePreference("autoscroll", "boolean", true);
    prefs.save();

    module.exports = prefs;
});
