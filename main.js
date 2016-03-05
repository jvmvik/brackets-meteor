/* Meteor integration in Brackets editor.
 *
 *  Credit: Most of the code and idea comes from Marius K. work.
 *   - https://github.com/Acconut/brackets-nodejs
 *
 */
define(function (require, exports, module) {
    "use strict";

    /** --- MODULES --- **/
    var CommandManager = brackets.getModule("command/CommandManager"),
        Menus = brackets.getModule("command/Menus"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        WorkspaceManager = brackets.getModule("view/WorkspaceManager"),
        ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
        MeteorDomain = brackets.getModule("utils/NodeDomain"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        ansi = require("./ansi"),
        prefs = require("./preferences"),
        MeteorMenuID = "meteor-menu",
        MeteorMenu = Menus.addMenu("Meteor", MeteorMenuID),
        METEOR_SETTINGS_DIALOG_ID = "meteor-settings-dialog",
        METEOR_EXEC_DIALOG_ID = "meteor-exec-dialog",
        LS_PREFIX = "meteor-",
        DOMAIN_NAME = "brackets-meteor",
        scrollEnabled = prefs.get("autoscroll");

    /**
     * Connect to the backend meteor domain
     */
    var domain = new MeteorDomain(DOMAIN_NAME, ExtensionUtils.getModulePath(module, "meteor/processDomain"));
    
    domain.on("output", function(info, data) {
        Panel.write(data);
    });

    /**
     * The ConnectionManager helps to build and run request to execute a file on the serverside
     */
    var ConnectionManager = {

        last: {
            command: null,
            cwd: null
        },

        /**
         * Creates a new EventSource
         *
         * @param (optional): Command
         * @param (optional): Current working directory to use
         */
        // This need to be inside quotes since new is a reserved word
        "new": function (command, cwd) {
            // If no cwd is specified use the current file's directory
            // if available else fallback to the project directory
            var doc = DocumentManager.getCurrentDocument(),
                dir;
            if(cwd) {
                dir = cwd;
            } else if(doc !== null && doc.file.isFile) {
                dir = doc.file.parentPath;
            } else {
                dir = ProjectManager.getProjectRoot().fullPath;
            }
            
            ConnectionManager.exit();
            Panel.show(command);
            Panel.clear();
            
            domain.exec("startProcess", command, dir)
                .done(function(exitCode) {
                    Panel.write("Program exited with status code of " + exitCode + ".");
                }).fail(function(err) {
                    Panel.write("Error inside brackets-meteor' processes occured: \n" + err);
                });
            
            // Store the last command and cwd
            this.last.command = command;
            this.last.cwd = dir;

        },

        newMeteor: function (command) {

            var meteorBin = prefs.get("meteor-bin");
            if(meteorBin === "") {
                meteorBin = "meteor";
            } else {
                // Add quotation because windows paths can contain spaces
                meteorBin = '"' + meteorBin + '"';
            }

            this.new(meteorBin + " " + command);

        },

        rerun: function () {

            var last = this.last;
            if(last.command === null) return;

            this.new(last.command, last.cwd);

        },

        /**
         * Close the current connection if server is started
         */
        exit: function () {
            domain.exec("stopProcess");
        }
    };

    /**
     * Panel alias terminal
     */
    $(".content").append(require("text!html/panel.html"));
    var Panel = {

        id: "brackets-meteor-terminal",
        panel: null,
        commandTitle: null,
        height: 201,

        get: function (qs) {
            return this.panel.querySelector(qs);
        },

        /**
         * Basic functionality
         */
        show: function (command) {
            this.panel.style.display = "block";
            this.commandTitle.textContent = command;
            WorkspaceManager.recomputeLayout();
        },
        hide: function () {
            this.panel.style.display = "none";
            WorkspaceManager.recomputeLayout();
        },
        clear: function () {
            this.pre.innerHTML = null;
        },

        /**
         * Prints a string into the terminal
         * It will be colored and then escape to prohibit XSS (Yes, inside an editor!)
         *
         * @param: String to be output
         */
        write: function (str) {
            var e = document.createElement("span");
            e.innerHTML = ansi(str.replace(/</g, "&lt;").replace(/>/g, "&gt;"));

            var scroll = false;
            if (this.pre.parentNode.scrollTop === 0 || this.pre.parentNode.scrollTop === this.pre.parentNode.scrollHeight || this.pre.parentNode.scrollHeight - this.pre.parentNode.scrollTop === this.pre.parentNode.clientHeight) {
                scroll = true;
            }

            this.pre.appendChild(e);

            if (scroll && scrollEnabled) {
                this.pre.parentNode.scrollTop = this.pre.parentNode.scrollHeight;
            }
        },

        /**
         * Used to enable resizing the panel
         */
        mousemove: function (e) {

            var h = Panel.height + (Panel.y - e.pageY);
            Panel.panel.style.height = h + "px";
            WorkspaceManager.recomputeLayout();

        },
        mouseup: function (e) {

            document.removeEventListener("mousemove", Panel.mousemove);
            document.removeEventListener("mouseup", Panel.mouseup);

            Panel.height = Panel.height + (Panel.y - e.pageY);

        },
        y: 0
    };

    // Still resizing
    Panel.panel = document.getElementById(Panel.id);
    if(Panel.panel == null)
        throw 'Element is not found';
    
    Panel.commandTitle = Panel.get(".cmd");
    Panel.pre = Panel.get(".table-container pre");
    Panel.get(".resize").addEventListener("mousedown", function (e) {

        Panel.y = e.pageY;

        document.addEventListener("mousemove", Panel.mousemove);
        document.addEventListener("mouseup", Panel.mouseup);

    });

    /**
     * Terminal buttons
     */
    Panel.get(".action-close").addEventListener("click", function () {
        ConnectionManager.exit();
        Panel.hide();
    });
    Panel.get(".action-terminate").addEventListener("click", function () {
        ConnectionManager.exit();
    });
    Panel.get(".action-rerun").addEventListener("click", function () {
        ConnectionManager.rerun();
    });

    var Dialog = {
        /**
         * The settings modal is used to configure the path to node's and node's binary
         * HTML : html/modal-settings.html
         */
        settings: {

            /**
             * HTML put inside the dialog
             */
            html: require("text!html/modal-settings.html"),

            /**
             * Opens up the modal
             */
            show: function () {
                Dialogs.showModalDialog(
                    METEOR_SETTINGS_DIALOG_ID, // ID the specify the dialog
                    "Meteor.js-Configuration", // Title
                    this.html, // HTML-Content
                    [ // Buttons
                        {
                            className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                            id: Dialogs.DIALOG_BTN_OK,
                            text: "Save"
                        }, {
                            className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
                            id: Dialogs.DIALOG_BTN_CANCEL,
                            text: "Cancel"
                        }
                    ]
                ).done(function (id) {

                    // Only saving
                    if (id !== "ok") return;

                    var meteor = meteorInput.value,
                    // Store autoscroll config globally
                    scrollEnabled = scrollInput.checked;

                    prefs.set("meteor-bin", meteor.trim());
                    prefs.set("autoscroll", scrollEnabled);
                    prefs.save();

                });

                // It's important to get the elements after the modal is rendered but before the done event
                var meteorInput = document.querySelector("." + METEOR_SETTINGS_DIALOG_ID + " .node"),
                    scrollInput = document.querySelector("." + METEOR_SETTINGS_DIALOG_ID + " .autoscroll");
                   
                meteorInput.value = prefs.get("meteor-bin");
                scrollInput.checked = prefs.get("autoscroll");
            }
        },

        /**
         * The exec modal is used to execute a command
         */
        exec: {

            /**
             * HTML put inside the dialog
             */
            html: require("text!html/modal-exec.html"),

            /**
             * Opens up the modal
             */
            show: function () {

                Dialogs.showModalDialog(
                    METEOR_EXEC_DIALOG_ID,
                    "Launch meteor",
                    this.html, [{
                        className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                        id: Dialogs.DIALOG_BTN_OK,
                        text: "Run"
                    }, {
                        className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
                        id: Dialogs.DIALOG_BTN_CANCEL,
                        text: "Cancel"
                    }]
                ).done(function (id) {

                    if (id !== "ok") return;

                    // Command musn't be empty
                    if (command.value.trim() == "") {
                        Dialogs.showModalDialog(Dialogs.DIALOG_ID_ERROR, "Error", "Please enter a valid meteor argument. e.g.: help");
                        return;
                    }

                    ConnectionManager.newMeteor(command.value);

                });

                // It's important to get the elements after the modal is rendered but before the done event
                var command = document.querySelector("." + METEOR_EXEC_DIALOG_ID + " .command"),
                    cwd = document.querySelector("." + METEOR_EXEC_DIALOG_ID + " .cwd");

                command.focus();

            }
        }
    };

    /**
     * Menu
     */
    var EXEC_CMD_ID = "brackets-meteor.exec",
        RUN_METEOR_CMD_ID = "brackets-meteor.run",
        DEBUG_METEOR_CMD_ID = "brackets-meteor.debug",
        CONFIG_CMD_ID = "brackets-meteor.config",
        STOP_METEOR_CMD_ID = "brackets-meteor.stop";
    
    CommandManager.register("Run", RUN_METEOR_CMD_ID, function () {
        ConnectionManager.newMeteor("run");
    });
    CommandManager.register("Debug", DEBUG_METEOR_CMD_ID, function () {
        ConnectionManager.newMeteor("debug");
    });
    CommandManager.register("Stop", STOP_METEOR_CMD_ID, function () {
        ConnectionManager.exit();
        Panel.hide();
    });
    
    CommandManager.register("Run..", EXEC_CMD_ID, function() {
        Dialog.exec.show();
    });

    CommandManager.register("Configuration...", CONFIG_CMD_ID, function () {
        Dialog.settings.show();
    });

    MeteorMenu.addMenuItem(RUN_METEOR_CMD_ID, "Alt-R");
    MeteorMenu.addMenuItem(DEBUG_METEOR_CMD_ID, "Alt-D");
    MeteorMenu.addMenuItem(STOP_METEOR_CMD_ID, "Alt-C");
    MeteorMenu.addMenuDivider();
    MeteorMenu.addMenuItem(EXEC_CMD_ID, "Alt-X");
    MeteorMenu.addMenuDivider();
    MeteorMenu.addMenuItem(CONFIG_CMD_ID);

    /*
     * Filter meteor directory
     */
    var FileSystem  = brackets.getModule("filesystem/FileSystem");
    var _oldFilter = FileSystem._FileSystem.prototype._indexFilter;
    
    FileSystem._FileSystem.prototype._indexFilter = function (path, name) {
        // Call old filter
        var result = _oldFilter.apply(this, arguments);
        
        if (!result) {
            return false;
        }
        
        return !name.match(/node_modules|\.meteor/);
    };
});
