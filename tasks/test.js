'use strict';

var AWS = require('aws-sdk');
var Q = require('q');
var fs = require('fs');
var path = require('path');

module.exports = function(grunt) {
    var cloudFormation;

    function initCloudFormation(auth, region) {
        AWS.config.loadFromPath(auth);
        AWS.config.update({ region: region });
        cloudFormation = new AWS.CloudFormation();
    }

    function getStackOutputs(stack) {
        return Q.Promise(function(resolve, reject) {
            cloudFormation.describeStacks({
                StackName: stack
            }, function(error, data) {
                if(error) {
                    reject(error);
                } else {
                    resolve(data.Stacks[0].Outputs);
                }
            });
        });
    }

    grunt.registerMultiTask('test', 'runs tests', function() {
        var done = this.async();
        var options = this.options();
        var target = this.target;

        switch(target) {
        case 'unit':
            grunt.task.run('jasmine_nodejs:unit');
            done();
            break;
        case 'e2e':
            var appKey = grunt.option('appKey');
            var appSecret = grunt.option('appSecret');
            var auth = grunt.option('awsAuth') || path.join(process.env.HOME, '.aws.json');
            var cloudStack = grunt.option('formation');
            var hubspotApiKey = grunt.option('hubspotApiKey');
            var region = grunt.option('region') || 'us-east-1';
            var timeStream = options.timeStream;
            var watchmanStream = options.watchmanStream;
            var cwrxStream = options.cwrxStream;
            var cwrxStream2 = options.cwrxStream2;
            var mongoHost = grunt.option('dbHost') || options.mongoHost;
            var apiRoot = grunt.option('apiRoot') || options.apiRoot;
            var watchmanHost = grunt.option('watchmanHost') || options.watchmanHost;
            var appPrefix = grunt.option('appPrefix') || options.appPrefix;
            var sshUser = grunt.option('sshUser') || options.sshUser;
            var sshKey = grunt.option('sshKey') || options.sshKey;

            initCloudFormation(auth, region);

            Q.resolve().then(function() {
                if(cloudStack) {
                    return getStackOutputs(cloudStack).then(function(outputs) {
                        outputs.forEach(function(output) {
                            switch(output.OutputKey) {
                            case 'apiServer':
                                apiRoot = 'http://' + output.OutputValue;
                                break;
                            case 'mongo':
                                mongoHost = output.OutputValue;
                                break;
                            case 'timeStream':
                                timeStream = output.OutputValue;
                                break;
                            case 'watchmanStream':
                                watchmanStream = output.OutputValue;
                                break;
                            case 'cwrxStream':
                                cwrxStream = output.OutputValue;
                                break;
                            case 'cwrxStream2':
                                cwrxStream2 = output.OutputValue;
                                break;
                            case 'watchman':
                                watchmanHost = output.OutputValue;
                                break;
                            }
                        });
                    });
                }
            }).then(function() {
                // Read appCreds from file
                var appCreds;
                try {
                    appCreds = grunt.file.readJSON('.rcAppCreds.json');
                } catch(error) {
                    appCreds = {
                        key: appKey,
                        secret: appSecret
                    };
                }
                var mongoCfg = {
                    host: mongoHost,
                    port: 27017,
                    db: 'c6Db',
                    user: 'e2eTests',
                    pass: 'password'
                };
                process.env.appCreds = JSON.stringify(appCreds);

                // Read AWS creds from file
                try {
                    var credsPath = path.join(process.env.HOME,'.aws.json');
                    process.env.awsCreds = fs.readFileSync(credsPath, {
                        encoding: 'utf-8'
                    });
                } catch(error) {
                    process.env.awsCreds = null;
                }

                // Read other secrets from file
                var secrets;
                try {
                    secrets = grunt.file.readJSON('.secrets.json');
                } catch(error) {
                    secrets = {
                        hubspot: {
                            key: hubspotApiKey
                        }
                    };
                }
                process.env.secrets = JSON.stringify(secrets);

                process.env.apiRoot = apiRoot;
                process.env.mongo = JSON.stringify(mongoCfg);
                process.env.timeStream = timeStream;
                process.env.watchmanStream = watchmanStream;
                process.env.cwrxStream = cwrxStream;
                if (cwrxStream2) {
                    process.env.cwrxStream2 = cwrxStream2;
                }
                process.env.watchmanHost = watchmanHost;
                process.env.appPrefix = appPrefix;
                process.env.sshUser = sshUser;
                process.env.sshKey = sshKey;

                grunt.task.run(['exec:setup_e2e', 'jasmine_nodejs:e2e']);
                done();
            }).catch(function(error) {
                grunt.log.error(error);
                done(false);
            });
            break;
        }
    });
};
