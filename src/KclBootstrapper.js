'use strict';

var childProcess = require('child_process');
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
    * Parses command line options to get the java path, MultiLangDaemon properties file, user, and
    * group options.
    *
    * @return {Object} An options object containing the parsed entities.
    */
    parseCmdLine: function() {
        program
            .option('-j --java <java path>', 'path to java binary')
            .option('-p --properties <properties file>', 'path to MutiLangDaemon properties file')
            .option('-u --user <user name>', 'the name of the user ')
            .option('-g --group <group name>', 'the name of the group ')
            .parse(process.argv);

        // Ensure java path was specified
        var javaPath = program.java;
        if(!javaPath) {
            throw new Error('You must specify a java path');
        }
        
        // Ensure properties path was specified
        var propertiesPath = program.properties;
        if(!propertiesPath) {
            throw new Error('You must specify a properties path');
        }

        // Ensure user and group were specified
        var user = program.user;
        var group = program.group;
        if(!user || !group) {
            throw new Error('You must specify a user and group');
        }

        return {
            java: javaPath,
            properties: propertiesPath,
            user: user,
            group: group
        };
    },
    
    /**
    * Parses command line options and runs the bootstrapper.
    */
    run: function() {
        var options = this.parseCmdLine();

        process.setgid(options.group);
        process.setuid(options.user);

        // Spawn the MultiLangDaemon
        var classpath = path.resolve(PROJECT_ROOT, 'jars', '*') + ':/';
        var args = ['-cp', classpath,  MULTI_LANG_DAEMON_CLASS, options.properties];
        var child = childProcess.spawn(options.java, args, {
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
