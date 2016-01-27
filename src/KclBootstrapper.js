'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var program = require('commander');

var MULTI_LANG_DAEMON_CLASS = 'com.amazonaws.services.kinesis.multilang.MultiLangDaemon';
var PROJECT_ROOT = path.resolve(path.dirname(require.main.filename), '..');

var __ut__ = (global.jasmine !== undefined) ? true : false;

/**
* KCL MultiLangDaemon Bootstrapper
*
* This script is used to bootstrap a KCL application by starting the MultiLangDaemon. In order to
* run this script you must pass it a watchman configuration file, consumer index, user, and group.
* The consumer index specifies the index of the consumer in the configuration file that should be
* spawned. The user and group settings dictate the user and group under which the resulting KCL
* will run. Before launching the MultiLangDaemon, this script validates the configuration file in
* an attempt to preemptively catch potential errors.
*
* @class KclBootstrapper
* @constructor
*/
function KclBootstrapper() {
}
KclBootstrapper.prototype = {
    /**
    * Checks the validity of a watchman configuration file. The configuration must match the
    * defined schema. Configuration file and directory paths must be specified as absolute paths.
    *
    * @param {Object} config A watchman configuration object to be checked for errors.
    * @return {String} Returns an error message if one exists or null otherwise.
    */
    checkConfig: function(config, index) {
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

        function checkString(val) {
            return (typeof val === 'string') ? null : 'Not a string';
        }

        function checkObject(val) {
            return (typeof val === 'object') ? null : 'Not an object';
        }
        
        function checkEmptyObject(val) {
            return (Object.keys(val).length === 0) ? 'Empty object' : null;
        }
        
        // Checks that the given value is valid configuration for a consumer and that the specified
        // event processor exists.
        function checkConsumers(val) {
            if(!Array.isArray(val)) {
                return 'Not an array';
            }
            var consumers = val.map(function(consumer) {
                var result = consumer;
                if(consumer.processor) {
                    result.processor = path.resolve(PROJECT_ROOT, 'src/event_processors/' +
                        consumer.processor);
                }
                return result;
            });
            var schema = {
                appName: 'string',
                processor: 'file',
                properties: 'file'
            };
            for(var i=0;i<consumers.length;i++) {
                var consumer = consumers[i];
                var configError = validate(consumer, schema);
                if(configError) {
                    return i + ': ' + configError;
                }
            }
            return null;
        }
        
        // Checks that the given value is valid configuration for the event processors. Makes sure
        // that any specified actions exist.
        function checkProcessors(val) {
            var configError = checkObject(val);
            if(configError) {
                return configError;
            }
            var processorNames = Object.keys(val);
            for(var i=0;i<processorNames.length;i++) {
                var processorName = processorNames[i];
                var processorConfig = val[processorName];
                configError = checkObject(processorConfig) || checkEmptyObject(processorConfig);
                if(configError) {
                    return processorName + ': ' + configError;
                }
                var eventNames = Object.keys(processorConfig);
                for(var j=0;j<eventNames.length;j++) {
                    var eventName = eventNames[j];
                    var eventConfig = processorConfig[eventName];
                    var actions = eventConfig.actions;
                    if(!actions || actions.length === 0) {
                        return processorName + ': ' + eventName + ': ' + 'Must contain actions';
                    }
                    for(var k=0;k<actions.length;k++) {
                        var actionName = actions[k].name || actions[k];
                        configError = checkFile(path.resolve(PROJECT_ROOT, 'src/actions/' +
                            actionName + '.js'));
                        if(configError) {
                            return processorName +  ': ' + eventName + ': actions: ' + k +
                                ': Invalid action';
                        }
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
            case 'consumers':
                return checkConsumers;
            case 'string':
                return checkString;
            case 'processors':
                return checkProcessors;
            case 'object':
                return checkObject;
            default:
                throw new Error('Invalid schema type \'' + schemaType + '\'');
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

        // Validates that the given index corresponds to a consumer in the configuration
        function validateConsumerIndex(index) {
            return config.kinesis.consumers[index] ? null : 'Invalid consumer index';
        }

        // Validates the configuration occurding to the defined schema
        var schema = {
            java: {
                jarPath: 'dir',
                path: 'file'
            },
            kinesis: {
                pidPath: 'dir',
                consumers: 'consumers',
                watchmanProducer: {
                    stream: 'string',
                    region: 'string'
                }
            },
            eventProcessors: 'processors',
            log: 'object'
        };
        return validate(config, schema) || validateConsumerIndex(index);
    },
    
    /**
    * Parses command line options to get the watchman configuration object, consumer configuration
    * object, user, and group.
    *
    * @return {Object} An options object containing the parsed entities.
    */
    parseCmdLine: function() {
        program
            .option('-c, --config <config file>', 'configuration for the service')
            .option('-i, --index <consumer index>',
                'the index in the consumers array configuration')
            .option('-u --user <user name>', 'the name of the user ')
            .option('-g --group <group name>', 'the name of the group ')
            .parse(process.argv);

        // Load the config
        var configPath = program.config;
        var config = require(configPath);

        // Validate the consumer index
        var index = parseInt(program.index);
        if(isNaN(index)) {
            throw new Error('You must specify a consumer index');
        }

        // Ensure user and group were specified
        var user = program.user;
        var group = program.group;
        if(!user || !group) {
            throw new Error('You must specify a user and group');
        }

        return {
            config: config,
            index: index,
            user: user,
            group: group
        };
    },
    
    /**
    * Parses command line options, verifies them, and runs the bootstrapper.
    */
    run: function() {
        var options = this.parseCmdLine();

        process.setgid(options.group);
        process.setuid(options.user);

        var configError = this.checkConfig(options.config, options.index);
        if(configError) {
            throw new Error(configError);
        } 
        
        var consumerConfig = options.config.kinesis.consumers[options.index];
        var javaPath = options.config.java.path;
        var propertiesFile = consumerConfig.properties;

        // Spawn the MultiLangDaemon
        var classpath = path.resolve(PROJECT_ROOT, 'jars', '*') + ':/';
        var args = ['-cp', classpath,  MULTI_LANG_DAEMON_CLASS, propertiesFile];
        var child = childProcess.spawn(javaPath, args, {
            stdio: 'inherit'
        });

        // Exit the bootstrapper if the spawned process terminates
        child.on('exit', function() {
            process.exit(1);
        });
        
        // Exit the spawned process if the bootstrapper terminates
        process.on('SIGINT', function() {
            child.kill();
        });
        process.on('SIGTERM', function() {
            child.kill();
        });
    }
};

// Export functions for unit testing
if (__ut__){
    module.exports = KclBootstrapper;
} else {
    var bootstrapper = new KclBootstrapper();
    bootstrapper.run();
}
