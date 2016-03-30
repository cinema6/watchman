'use strict';

var RecordProcessor = require('./record_processors/RecordProcessor.js');
var fs = require('fs');
var kcl = require('aws-kcl');
var logger = require('cwrx/lib/logger.js');
var path = require('path');
var program = require('commander');

var PROJECT_ROOT = path.resolve(path.dirname(require.main.filename), '..');

var __ut__ = (global.jasmine !== undefined) ? true : false;

/**
* KCL Consumer Application
*
* This script takes as arguments a watchman configuration file as well as an index corresponding
* to the KCL application you wish to start. This index corresponds to an entry in the
* kinesis.consumers array in teh configuration file. This script should only be invoked by the
* MultiLangDaemon when it is started. A reference to this script must be included in the
* .properties file passed to the MultiLangDaemon.
*
* @class KclApp
* @constructor
*/
function KclApp() {
    this.config = null;
    this.configPath = null;
    this.recordProcessor = null;
}
KclApp.prototype = {
    /**
    * Checks the validity of a watchman configuration file. The configuration must match the
    * defined schema. Configuration file and directory paths must be specified as absolute paths.
    *
    * @param {Object} config A watchman configuration object to be checked for errors.
    * @return {String} Returns an error message if one exists or null otherwise.
    */
    checkConfig: function(config) {
        function isAbsolute(path) {
            return (path.charAt(0) === '/');
        }

        function isFile(path) {
            try {
                return fs.statSync(path).isFile();
            } catch(error) {
                return false;
            }
        }

        function isDirectory(path) {
            try {
                return fs.statSync(path).isDirectory();
            } catch(error) {
                return false;
            }
        }

        function checkFile(val) {
            return (isAbsolute(val) && isFile(val)) ? null : 'Not a valid absolute file path';
        }

        function checkDir(val) {
            return (isAbsolute(val) && isDirectory(val)) ? null :
                'Not a valid absolute directory path';
        }

        function checkType(val, type) {
            return (typeof val === type) ? null : 'Not a ' + type;
        }

        // Checks that the specified event processor exists.
        function checkProcessor(val) {
            var processorPath = path.resolve(PROJECT_ROOT, 'src/event_processors', val);
            return checkFile(processorPath);
        }

        // Checks that the given value is valid configuration for the event processors. Makes sure
        // that any specified actions exist.
        function checkHandlers(val) {
            var configError = checkType(val, 'object');
            if(configError) {
                return configError;
            }
            var eventNames = Object.keys(val);
            for(var j=0;j<eventNames.length;j++) {
                var eventName = eventNames[j];
                var eventConfig = val[eventName];
                var actions = eventConfig.actions;
                if(!actions || actions.length === 0) {
                    return eventName + ': ' + 'Must contain actions';
                }
                for(var k=0;k<actions.length;k++) {
                    var actionName = actions[k].name || actions[k];
                    configError = checkFile(path.resolve(PROJECT_ROOT, 'src/actions/' +
                        actionName + '.js'));
                    if(configError) {
                        return eventName + ': actions: ' + k + ': Invalid action';
                    }
                }
            }
            return null;
        }

        // Gets the validation function for a given schema type
        function getValidationFn(schemaType) {
            switch(schemaType) {
            case 'file':
                return checkFile;
            case 'dir':
                return checkDir;
            case 'processor':
                return checkProcessor;
            case 'handlers':
                return checkHandlers;
            default:
                return function(val) {
                    return checkType(val, schemaType);
                };
            }
        }

        // Validates a given piece of configuration against a given piece of schema
        function validate(configValue, schemaValue) {
            if(typeof schemaValue === 'object') {
                var keys = Object.keys(schemaValue);
                for(var i=0;i<keys.length;i++) {
                    var key = keys[i];
                    var configVal = configValue[key];
                    var schemaVal = schemaValue[key];
                    if(configVal) {
                        var configError = validate(configVal, schemaVal);
                        if(configError) {
                            return key + ': ' + configError;
                        }
                    } else {
                        return key + ': Missing value';
                    }
                }
            } else {
                var fn = getValidationFn(schemaValue);
                return fn(configValue);
            }
            return null;
        }

        // Validates the configuration occurding to the defined schema
        var schema = {
            log: 'object',
            secrets: 'file',
            appCreds: 'file',
            cwrx: {
                api: 'object'
            },
            pidPath: 'dir',
            kinesis: {
                consumer: {
                    processor: 'processor',
                    appName: 'string'
                },
                producer: {
                    stream: 'string',
                    region: 'string'
                }
            },
            eventHandlers: 'handlers',
            cloudWatch: {
                namespace: 'string',
                region: 'string',
                dimensions: 'object',
                sendInterval: 'number'
            },
            emails: {
                sender: 'string',
                dashboardLinks: 'object',
                manageLink: 'string',
                reviewLink: 'string',
                activationTargets: 'object',
                supportAddress: 'string',
                passwordResetPages: 'object',
                forgotTargets: 'object'
            }
        };
        return validate(config, schema);
    },

    /**
    * Parses command line options to get the path to this application's configuration.
    *
    * @return {Object} An options object containing the parsed entities.
    */
    parseCmdLine: function() {
        program
            .option('-c, --config <config file>', 'configuration file for the service')
            .parse(process.argv);

        // Ensure config was specified
        var configPath = program.config;
        if(!configPath) {
            throw new Error('You must specify a config');
        }

        return {
            configPath: configPath
        };
    },

    /**
    * Loads configuration from the configPath. If configuration already exists, the application log
    * is refreshed and event processor actions are updated.
    */
    loadConfig: function() {
        var configPath = this.configPath;
        var config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        // Validate the config
        var configError = this.checkConfig(config);
        if(configError) {
            throw new Error(configError);
        }

        // Read the secrets file
        var secretsPath = config.secrets;
        var secrets = require(secretsPath);
        config.state = {
            secrets: secrets
        };

        // Read the rcAppCreds file
        var appCredsPath = config.appCreds;
        var appCreds = require(appCredsPath);
        config.appCreds = appCreds;

        // Handle changes to the config
        if(this.config) {
            // Refresh the log
            var log = logger.getLog();
            log.refresh();

            // Reload required actions
            var eventProcessor = this.recordProcessor.processor;
            eventProcessor.config = config;
            eventProcessor.loadActions();
        }

        // Update the config
        this.config = config;
    },

    /**
    * Parses command line options, manages a pid file, and launches a kcl record processor.
    */
    run: function() {
        var self = this;
        var options = self.parseCmdLine();

        self.configPath = options.configPath;
        self.loadConfig();

        var config = self.config;
        var log = logger.createLog(config.log);
        var consumerConfig = config.kinesis.consumer;

        try {
            var AppEventProcessor = require('./event_processors/' + consumerConfig.processor);
            var eventProcessor = new AppEventProcessor(config);
            self.recordProcessor = new RecordProcessor(eventProcessor, config.pidPath);
            log.info('[%1] Starting application', consumerConfig.appName);
            kcl(self.recordProcessor).run();
        } catch(error) {
            log.error('[%1] Error running application: %2', consumerConfig.appName, error);
            process.exit(1);
        }

        process.on('exit', function() {
            log.info('[%1] Exiting application', consumerConfig.appName);
        });
        process.on('SIGHUP', function() {
            log.info('[%1] Reloading configuration', consumerConfig.appName);
            try {
                self.loadConfig();
            } catch(error) {
                log.error('[%1] Error reloading configuration: %2', consumerConfig.appName, error);
            }
        });
    }
};

// Export functions for unit testing
if (__ut__){
    module.exports = KclApp;
} else {
    var app = new KclApp();
    app.run();
}
