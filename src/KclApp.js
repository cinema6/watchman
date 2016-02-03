'use strict';

var RecordProcessor = require('./record_processors/RecordProcessor.js');
var fs = require('fs');
var kcl = require('aws-kcl');
var logger = require('cwrx/lib/logger.js');
var path = require('path');
var program = require('commander');

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
}
KclApp.prototype = {
    /**
    * Writes this scripts' process id to a given file path.
    *
    * @param {String} filePath Absolute path to which to write the pid.
    */
    writePid: function(filePath) {
        var pid = process.pid;
        fs.writeFileSync(filePath, pid.toString());
    },
    
    /**
    * Removes an existing pid at the given file path.
    *
    * @param {String} filePath Absolute path to a pid to be removed.
    */
    removePid: function(filePath) {
        fs.unlinkSync(filePath);
    },
    
    /**
    * Parses command line options to get the watchman configuration and consumer configuration
    * object.
    *
    * @return {Object} An options object containing the parsed entities.
    */
    parseCmdLine: function() {
        program
            .option('-c, --config <config file>', 'configuration file for the service')
            .option('-i, --index <consumer index>',
                'the index in the consumers array configuration')
            .parse(process.argv);

        // Load the config
        var configPath = program.config;
        var config = require(configPath);

        // Read the secrets file
        var secretsPath = config.secrets;
        var secrets = require(secretsPath);
        config.secrets = secrets;

        // Validate the consumer index
        var index = parseInt(program.index);
        if(isNaN(index)) {
            throw new Error('You must specify a valid consumer index');
        }

        return {
            config: config,
            index: index
        };
    },
    
    /**
    * Parses command line options, manages a pid file, and launches a kcl record processor.
    */
    run: function() {
        var self = this;
        var options = self.parseCmdLine();
        var log = logger.createLog(options.config.log);
        var consumerConfig = options.config.kinesis.consumers[options.index];
        var pidFile = path.resolve(options.config.kinesis.pidPath, consumerConfig.appName + '.pid');

        try {
            var AppEventProcessor = require('./event_processors/' + consumerConfig.processor);
            var eventProcessor = new AppEventProcessor(options.config);
            var recordProcessor = new RecordProcessor(eventProcessor);
            log.info('[%1] Starting application', consumerConfig.appName);
            self.writePid(pidFile);
            kcl(recordProcessor).run();
        } catch(error) {
            log.error('[%1] Error running application: %2', consumerConfig.appName, error);
            process.exit(1);
        }

        process.on('exit', function() {
            log.info('[%1] Exiting application', consumerConfig.appName);
            self.removePid(pidFile);
        });
        process.on('SIGHUP', function() {
            log.info('[%1] Received SIGHUP', consumerConfig.appName);
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
