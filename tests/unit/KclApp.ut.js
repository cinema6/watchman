'use strict';

var KclApp;
var fs = require('fs');
var logger = require('cwrx/lib/logger.js');
var proxyquire = require('proxyquire').noCallThru();

describe('KclApp.js', function() {
    var app;
    var config;
    var mockKcl;
    var runSpy;
    var mockEventProcessor;
    var mockRecordProcessor;
    var mockLog;
    
    beforeEach(function() {
        config = {
            log: { },
            secrets: '/valid-file-secrets',
            cwrx: {
                api: { }
            },
            pidPath: '/valid-dir',
            kinesis: {
                consumer: {
                    appName: 'appName',
                    processor: 'ValidProcessor.js'
                },
                producer: {
                    stream: 'streamName',
                    region: 'regionName'
                }
            },
            eventHandlers: {
                pulse: {
                    actions: ['valid_action']
                },
                evnt: {
                    actions: [
                        {
                            name: 'valid_action'
                        }
                    ]
                }
            }
        };
        runSpy = jasmine.createSpy('run()');
        mockKcl = jasmine.createSpy('kcl').and.returnValue({
            run: runSpy
        });
        mockEventProcessor = jasmine.createSpy('mockEventProcessor()');
        mockRecordProcessor = jasmine.createSpy('mockRecordProcessor()');
        mockLog = {
            trace: jasmine.createSpy('trace()'),
            info: jasmine.createSpy('info()'),
            warn: jasmine.createSpy('warn()'),
            error: jasmine.createSpy('error()'),
            refresh: jasmine.createSpy('refresh()')
        };
        KclApp = proxyquire('../../src/KclApp.js', {
            'aws-kcl': mockKcl,
            './event_processors/ValidProcessor.js': mockEventProcessor,
            './record_processors/RecordProcessor.js': mockRecordProcessor,
            '/valid-file-secrets': 'so secret'
        });
        app = new KclApp();
        spyOn(fs, 'statSync').and.callFake(function(path) {
            return {
                isFile: function() {
                    return (path.indexOf('valid-file') === 1 ||
                        path.indexOf('/src/event_processors/ValidProcessor.js') !== -1 ||
                        path.indexOf('/src/actions/valid_action.js') !== -1);
                },
                isDirectory: function() {
                    return (path.slice(1) === 'valid-dir');
                }
            };
        });
        spyOn(fs, 'writeFileSync');
        spyOn(fs, 'unlinkSync');
        spyOn(fs, 'readFileSync');
        spyOn(app, 'parseCmdLine');
        spyOn(app, 'checkConfig');
        spyOn(app, 'writePid');
        spyOn(app, 'removePid');
        spyOn(app, 'loadConfig');
        spyOn(logger, 'createLog').and.returnValue(mockLog);
        spyOn(process, 'on');
        spyOn(process, 'exit');
    });
    
    describe('the constructor', function() {
        it('should initialize properties', function() {
            expect(app.recordProcessor).toBeNull();
            expect(app.configPath).toBeNull();
        });
    });
    
    describe('checkConfig', function() {
        beforeEach(function() {
            app.checkConfig.and.callThrough();
        });
        
        it('should return null when passed a valid config', function() {
            var configError = app.checkConfig(config, 0);
            expect(configError).toBeNull();
        });
        
        describe('log', function() {
            it('should return an error message if missing', function() {
                delete config.log;
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('log: Missing value');
            });
            
            it('should return an error emssage if not an object', function() {
                config.log = 'not object';
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('log: Not an object');
            });
        });

        describe('secrets', function() {
            it('should return an error message if missing', function() {
                delete config.secrets;
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('secrets: Missing value');
            });
            
            it('should return an error message if not a file', function() {
                config.secrets = '/invalid-file';
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('secrets: Not a valid absolute file path');
            });
            
            it('should return an error message if not an absolute path', function() {
                config.secrets = 'valid-file';
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('secrets: Not a valid absolute file path');
            });
        });

        describe('cwrx.api', function() {
            it('should return an error message if missing', function() {
                delete config.cwrx.api;
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('cwrx: api: Missing value');
            });
            
            it('should return an error emssage if not an object', function() {
                config.cwrx.api = 'not object';
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('cwrx: api: Not an object');
            });
        });

        describe('pidPath', function() {
            it('should return an error message if missing', function() {
                delete config.pidPath;
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('pidPath: Missing value');
            });
            
            it('should return an error message if not a directory', function() {
                config.pidPath = '/invalid-dir';
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe(
                    'pidPath: Not a valid absolute directory path');
            });
            
            it('should return an error message if not an absolute path', function() {
                config.pidPath = 'valid-dir';
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe(
                    'pidPath: Not a valid absolute directory path');
            });
        });
        
        describe('kinesis.consumers', function() {
            it('should return an error message if missing', function() {
                delete config.kinesis.consumer;
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('kinesis: consumer: Missing value');
            });
        });
        
        describe('kinesis.consumer.processor', function() {
            it('should return an error message if it contains a consumer without a processor',
            function() {
                delete config.kinesis.consumer.processor;
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('kinesis: consumer: processor: Missing value');
                config.kinesis.consumer.processor = 'InvalidProcessor.js';
                configError = app.checkConfig(config, 0);
                expect(configError).toBe(
                    'kinesis: consumer: processor: Not a valid absolute file path');
            });
        });
        
        describe('kinesis.consumer.appName', function() {
            it('should return an error message if it contains a consumer without an appName',
            function() {
                delete config.kinesis.consumer.appName;
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('kinesis: consumer: appName: Missing value');
                config.kinesis.consumer.appName = 123;
                configError = app.checkConfig(config, 0);
                expect(configError).toBe('kinesis: consumer: appName: Not a string');
            });
            
        });

        describe('kinesis.producer.stream', function() {
            it('should return an error message if missing', function() {
                delete config.kinesis.producer.stream;
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('kinesis: producer: stream: Missing value');
            });
            
            it('should return an error message if not a string', function() {
                config.kinesis.producer.stream = 123;
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('kinesis: producer: stream: Not a string');
            });
        });
        
        describe('kinesis.producer.region', function() {
            it('should return an error message if missing', function() {
                delete config.kinesis.producer.region;
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('kinesis: producer: region: Missing value');
            });
            
            it('should return an error message if not a string', function() {
                config.kinesis.producer.region = 123;
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('kinesis: producer: region: Not a string');
            });
        });
        
        describe('eventHandlers', function() {
            it('should return an error message if missing or not an object', function() {
                delete config.eventHandlers;
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('eventHandlers: Missing value');
                config.eventHandlers = 'not object';
                configError = app.checkConfig(config, 0);
                expect(configError).toBe('eventHandlers: Not an object');
            });

            it('should return an error if event hashes are not objects containing actions',
            function() {
                config.eventHandlers.foo = 123;
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe('eventHandlers: foo: Must contain actions');
                config.eventHandlers.foo = { };
                configError = app.checkConfig(config, 0);
                expect(configError).toBe('eventHandlers: foo: Must contain actions');
                config.eventHandlers.foo = { actions: [] };
                configError = app.checkConfig(config, 0);
                expect(configError).toBe('eventHandlers: foo: Must contain actions');
            });
            
            it('should return an error if there are invalid actions', function() {
                config.eventHandlers.pulse.actions.push('invalid_action');
                var configError = app.checkConfig(config, 0);
                expect(configError).toBe(
                    'eventHandlers: pulse: actions: 1: Invalid action');
            });
        });        
    });

    describe('writePid', function() {
        beforeEach(function() {
            app.writePid.and.callThrough();
            app.writePid('path');
        });

        it('should write the pid to a file', function() {
            expect(fs.writeFileSync).toHaveBeenCalledWith('path', process.pid.toString());
        });
    });
    
    describe('removePid', function() {
        beforeEach(function() {
            app.removePid.and.callThrough();
            app.removePid('path');
        });
        
        it('should delete the pid file', function() {
            expect(fs.unlinkSync).toHaveBeenCalledWith('path');
        });
    });
    
    describe('parseCmdLine', function() {
        beforeEach(function() {
            app.parseCmdLine.and.callThrough();
        });
        
        it('should parse command line options and set the config path', function() {
            process.argv = ['', '', '-c', 'mockConfigPath'];
            var options = app.parseCmdLine();
            expect(options).toEqual({
                configPath: 'mockConfigPath'
            });
        });
        
        it('should throw an error if given an invalid config', function(done) {
            process.argv = ['', '', '-c', ''];
            try {
                app.parseCmdLine();
                done.fail();
            } catch(error) {
                expect(error).toBeDefined();
                done();
            }
        });
    });
    
    describe('run', function() {
        beforeEach(function() {
            app.parseCmdLine.and.returnValue({
                configPath: 'configPath'
            });
            app.loadConfig.and.callFake(function() {
                app.config = config;
            });
        });
        
        it('should parse command line arguments', function() {
            app.run();
            expect(app.parseCmdLine).toHaveBeenCalledWith();
            expect(app.configPath).toBe('configPath');
        });

        it('should load the config', function() {
            app.run();
            expect(app.loadConfig).toHaveBeenCalledWith();
        });
        
        it('should create the log', function() {
            app.run();
            expect(logger.createLog).toHaveBeenCalledWith({ });
        });
        
        it('should create a new event processor', function() {
            app.run();
            expect(mockEventProcessor).toHaveBeenCalledWith(config);
        });
        
        it('should create a new record processor', function() {
            app.run();
            expect(mockRecordProcessor).toHaveBeenCalledWith(jasmine.any(mockEventProcessor));
            expect(app.recordProcessor).toEqual(jasmine.any(mockRecordProcessor));
        });
        
        it('should write a pid file', function() {
            app.run();
            expect(app.writePid).toHaveBeenCalledWith('/valid-dir/appName.pid');
        });
        
        it('should run the kcl app', function() {
            app.run();
            expect(mockKcl).toHaveBeenCalledWith(jasmine.any(mockRecordProcessor));
            expect(runSpy).toHaveBeenCalledWith();
        });
        
        it('should log an error if the app fails to start', function() {
            runSpy.and.callFake(function() {
                throw new Error('epic fail');
            });
            app.run();
            expect(mockLog.error).toHaveBeenCalled();
            expect(process.exit).toHaveBeenCalledWith(1);
        });
        
        it('should remove the pid file on exit', function() {
            app.run();
            expect(process.on).toHaveBeenCalledWith('exit', jasmine.any(Function));
            var handler = process.on.calls.all().filter(function(call) {
                return call.args[0] === 'exit';
            })[0].args[1];
            handler();
            expect(app.removePid).toHaveBeenCalledWith('/valid-dir/appName.pid');
        });
        
        describe('the SIGHUP handler', function() {
            var handler;
            
            beforeEach(function() {
                app.run();
                handler = process.on.calls.all().filter(function(call) {
                    return call.args[0] === 'SIGHUP';
                })[0].args[1];
            });
            
            it('should be added', function() {
                expect(process.on).toHaveBeenCalledWith('SIGHUP', jasmine.any(Function));
            });
            
            it('try to reload the config', function() {
                handler();
                expect(app.loadConfig).toHaveBeenCalledWith();
            });
            
            it('should log an error if reloading the config fails', function() {
                app.loadConfig.and.callFake(function() {
                    throw new Error('epic fail');
                });
                handler();
                expect(mockLog.error).toHaveBeenCalled();
            });
        });
    });
    
    describe('the loadConfig method', function() {
        beforeEach(function() {
            app.loadConfig.and.callThrough();
            app.configPath = 'mockConfig';
            fs.readFileSync.and.returnValue(JSON.stringify(config));
        });
        
        it('should throw an error if attempting to load an invalid config', function(done) {
            app.checkConfig.and.returnValue('epic fail');
            try {
                app.loadConfig();
                done.fail();
            } catch(error) {
                expect(error).toEqual(new Error('epic fail'));
                done();
            }
        });
        
        it('should set the config property with added secrets', function() {
            expect(app.config).toBeNull();
            app.loadConfig();
            expect(fs.readFileSync).toHaveBeenCalledWith('mockConfig', 'utf8');
            config.secrets = 'so secret';
            expect(app.config).toEqual(config);
        });
        
        describe('reloading the config', function() {
            beforeEach(function() {
                app.config = 'not null';
                app.configPath = 'mockConfig';
                app.recordProcessor = {
                    processor: {
                        config: null,
                        loadActions: jasmine.createSpy('loadActions()')
                    }
                };
                app.loadConfig();
            });
            
            it('should refresh the log', function() {
                expect(mockLog.refresh).toHaveBeenCalledWith();
            });
            
            it('should update the config of the event processor', function() {
                config.secrets = 'so secret';
                expect(app.recordProcessor.processor.config).toEqual(config);
                expect(app.recordProcessor.processor.loadActions).toHaveBeenCalledWith();
            });
        });
    });
});
