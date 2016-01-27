'use strict';

var KclBootstrapper;
var childProcess = require('child_process');
var fs = require('fs');
var proxyquire = require('proxyquire').noCallThru();

describe('KclBootstrapper.js', function() {
    var bootstrapper;
    var config;
    var mockChild;

    beforeEach(function() {
        config = {
            java: {
                jarPath: '/valid-dir',
                path: '/valid-file'
            },
            kinesis: {
                pidPath: '/valid-dir',
                consumers: [
                    {
                        appName: 'appName',
                        processor: 'ValidProcessor.js',
                        properties: '/valid-file'
                    },
                    {
                        appName: 'appName',
                        processor: 'ValidProcessor.js',
                        properties: '/valid-file'
                    }
                ],
                watchmanProducer: {
                    stream: 'streamName',
                    region: 'regionName'
                }
            },
            eventProcessors: {
                time: {
                    pulse: {
                        actions: ['valid_action']
                    }
                },
                cwrx: {
                    evnt: {
                        actions: [
                            {
                                name: 'valid_action'
                            }
                        ]
                    }
                }
            },
            log: { }
        };
        KclBootstrapper = proxyquire('../../src/KclBootstrapper.js', {
            'mockConfig': config
        });
        bootstrapper = new KclBootstrapper();
        mockChild = {
            on: jasmine.createSpy('on'),
            kill: jasmine.createSpy('kill')
        };
        spyOn(bootstrapper, 'checkConfig');
        spyOn(bootstrapper, 'parseCmdLine');
        spyOn(fs, 'statSync').and.callFake(function(path) {
            console.log(path);
            return {
                isFile: function() {
                    return (path.slice(1) === 'valid-file' ||
                        path.indexOf('/src/event_processors/ValidProcessor.js') !== -1 ||
                        path.indexOf('/src/actions/valid_action.js') !== -1);
                },
                isDirectory: function() {
                    return (path.slice(1) === 'valid-dir');
                }
            };
        });
        spyOn(childProcess, 'spawn');
        spyOn(process, 'setgid');
        spyOn(process, 'setuid');
        spyOn(process, 'exit');
        spyOn(process, 'on');
    });
    
    describe('checkConfig', function() {
        beforeEach(function() {
            bootstrapper.checkConfig.and.callThrough();
        });
        
        it('should return null when passed a valid config', function() {
            var configError = bootstrapper.checkConfig(config, 0);
            expect(configError).toBeNull();
        });
        
        describe('java.jarPath', function() {
            it('should return an error message if missing', function() {
                delete config.java.jarPath;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('java: jarPath: Missing value');
            });
            
            it('should return an error message if not a directory', function() {
                config.java.jarPath = '/invalid-dir';
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('java: jarPath: Not a valid absolute directory path');
            });
            
            it('should return an error message if not an absolute path', function() {
                config.java.jarPath = 'valid-dir';
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('java: jarPath: Not a valid absolute directory path');
            });
        });
        
        describe('java.path', function() {
            it('should return an error message if missing', function() {
                delete config.java.path;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('java: path: Missing value');
            });
            
            it('should return an error message if not a file', function() {
                config.java.path = '/invalid-file';
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('java: path: Not a valid absolute file path');
            });
            
            it('should return an error message if not an absolute path', function() {
                config.java.path = 'valid-file';
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('java: path: Not a valid absolute file path');
            });
        });
        
        describe('kinesis.pidPath', function() {
            it('should return an error message if missing', function() {
                delete config.kinesis.pidPath;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('kinesis: pidPath: Missing value');
            });
            
            it('should return an error message if not a directory', function() {
                config.kinesis.pidPath = '/invalid-dir';
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('kinesis: pidPath: Not a valid absolute directory path');
            });
            
            it('should return an error message if not an absolute path', function() {
                config.kinesis.pidPath = 'valid-dir';
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('kinesis: pidPath: Not a valid absolute directory path');
            });
        });
        
        describe('kinesis.consumers', function() {
            it('should return an error message if missing', function() {
                delete config.kinesis.consumers;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('kinesis: consumers: Missing value');
            });
            
            it('should return an error message if not an array', function() {
                config.kinesis.consumers = 'not array';
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('kinesis: consumers: Not an array');
            });
            
            it('should return an error message if it contains a consumer without an appName',
            function() {
                delete config.kinesis.consumers[1].appName;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('kinesis: consumers: 1: appName: Missing value');
                config.kinesis.consumers[1].appName = 123;
                configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('kinesis: consumers: 1: appName: Not a string');
            });
            
            it('should return an error message if it contains a consumer without a processor',
            function() {
                delete config.kinesis.consumers[1].processor;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('kinesis: consumers: 1: processor: Missing value');
                config.kinesis.consumers[1].processor = 'InvalidProcessor.js';
                configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe(
                    'kinesis: consumers: 1: processor: Not a valid absolute file path');
            });
            
            it('should return an error message if it contains a consumer without properties',
            function() {
                delete config.kinesis.consumers[1].properties;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('kinesis: consumers: 1: properties: Missing value');
                config.kinesis.consumers[1].properties = '/invalid-file';
                configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe(
                    'kinesis: consumers: 1: properties: Not a valid absolute file path');
                config.kinesis.consumers[1].properties = 'valid-file';
                configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe(
                    'kinesis: consumers: 1: properties: Not a valid absolute file path');
            });
        });
        
        describe('kinesis.watchmanProducer.stream', function() {
            it('should return an error message if missing', function() {
                delete config.kinesis.watchmanProducer.stream;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('kinesis: watchmanProducer: stream: Missing value');
            });
            
            it('should return an error message if not a string', function() {
                config.kinesis.watchmanProducer.stream = 123;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('kinesis: watchmanProducer: stream: Not a string');
            });
        });
        
        describe('kinesis.watchmanProducer.region', function() {
            it('should return an error message if missing', function() {
                delete config.kinesis.watchmanProducer.region;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('kinesis: watchmanProducer: region: Missing value');
            });
            
            it('should return an error message if not a string', function() {
                config.kinesis.watchmanProducer.region = 123;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('kinesis: watchmanProducer: region: Not a string');
            });
        });
        
        describe('eventProcessors', function() {
            it('should return an error message if missing or not an object', function() {
                delete config.eventProcessors;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('eventProcessors: Missing value');
                config.eventProcessors = 'not object';
                configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('eventProcessors: Not an object');
            });

            it('should return an error message if processor hashes are not objects', function() {
                config.eventProcessors.foo = 123;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('eventProcessors: foo: Not an object');
                config.eventProcessors.foo = {};
                configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('eventProcessors: foo: Empty object');
            });
            
            it('should return an error if event hashes are not objects containing actions',
            function() {
                config.eventProcessors.time.foo = 123;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('eventProcessors: time: foo: Must contain actions');
                config.eventProcessors.time.foo = { };
                configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('eventProcessors: time: foo: Must contain actions');
                config.eventProcessors.time.foo = { actions: [] };
                configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('eventProcessors: time: foo: Must contain actions');
            });
            
            it('should return an error if there are invalid actions', function() {
                config.eventProcessors.time.pulse.actions.push('invalid_action');
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe(
                    'eventProcessors: time: pulse: actions: 1: Invalid action');
            });
        });
        
        describe('log', function() {
            it('should return an error message if missing', function() {
                delete config.log;
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('log: Missing value');
            });
            
            it('should return an error emssage if not an object', function() {
                config.log = 'not object';
                var configError = bootstrapper.checkConfig(config, 0);
                expect(configError).toBe('log: Not an object');
            });
        });
    });
    
    describe('run', function() {
        beforeEach(function() {
            config.java.path = '/usr/bin/java';
            config.kinesis.consumers[0].properties = 'mld.properties';
            bootstrapper.parseCmdLine.and.returnValue({
                config: config,
                index: 0,
                user: 'user',
                group: 'group'
            });
            bootstrapper.checkConfig.and.returnValue(null);
            childProcess.spawn.and.returnValue(mockChild);
        });
        
        it('should parse command line options', function() {
            bootstrapper.run();
            expect(bootstrapper.parseCmdLine).toHaveBeenCalledWith();
        });
        
        it('should set the gid and uid of the process', function() {
            bootstrapper.run();
            expect(process.setgid).toHaveBeenCalledWith('group');
            expect(process.setuid).toHaveBeenCalledWith('user');
        });
        
        it('should throw an error for an invalid config', function(done) {
            bootstrapper.checkConfig.and.returnValue('epic fail');
            try {
                bootstrapper.run();
                done.fail();
            } catch(error) {
                expect(error).toEqual(new Error('epic fail'));
                done();
            }
        });
        
        it('should spawn a MutiLangDaemon', function() {
            bootstrapper.run();
            expect(childProcess.spawn).toHaveBeenCalledWith('/usr/bin/java', jasmine.any(Array),
                { stdio: 'inherit' });
            var childArgs = childProcess.spawn.calls.mostRecent().args[1];
            expect(childArgs[0]).toBe('-cp');
            expect(childArgs[1]).toContain('/jars/*:/');
            expect(childArgs[2]).toBe('com.amazonaws.services.kinesis.multilang.MultiLangDaemon');
            expect(childArgs[3]).toBe('mld.properties');
        });
        
        it('should exit the bootstrapper when the MultiLangDaemon closes', function() {
            bootstrapper.run();
            expect(mockChild.on).toHaveBeenCalledWith('exit', jasmine.any(Function));
            var handler = mockChild.on.calls.mostRecent().args[1];
            handler();
            expect(process.exit).toHaveBeenCalledWith(1);
        });
        
        it('exit the MultiLangDaemon when the bootstrapper closes', function() {
            bootstrapper.run();
            var listeners = ['SIGINT', 'SIGTERM'];
            listeners.forEach(function(listener) {
                expect(process.on).toHaveBeenCalledWith(listener, jasmine.any(Function));
                mockChild.kill.calls.reset();
                var handler = process.on.calls.mostRecent().args[1];
                handler();
                expect(mockChild.kill).toHaveBeenCalled();
            });
        });
    });
    
    describe('parseCmdLine', function() {
        beforeEach(function() {
            bootstrapper.parseCmdLine.and.callThrough();
        });
        
        it('should parse command line options', function() {
            process.argv = ['', '', '-c', 'mockConfig', '-i', '0', '-u', 'sixxy', '-g', 'sixxy'];
            var options = bootstrapper.parseCmdLine();
            expect(options).toEqual({
                config: config,
                index: 0,
                user: 'sixxy',
                group: 'sixxy'
            });
        });
        
        it('should throw an error for invalid config', function(done) {
            process.argv = ['', '', '-c', 'invalidConfig', '-i', '0', '-u', 'sixxy', '-g', 'sixxy'];
            try {
                bootstrapper.parseCmdLine();
                done.fail();
            } catch(error) {
                expect(error).toBeDefined();
                done();
            }
        });
        
        it('should throw an error for invalid index', function(done) {
            process.argv = ['', '', '-c', 'mockConfig', '-i', 'invalid', '-u', 'sixxy', '-g',
                'sixxy'];
            try {
                bootstrapper.parseCmdLine();
                done.fail();
            } catch(error) {
                expect(error).toBeDefined();
                done();
            }
        });
        
        it('should throw an error for invalid user', function(done) {
            process.argv = ['', '', '-c', 'mockConfig', '-i', '0', '-u', '', '-g', 'sixxy'];
            try {
                bootstrapper.parseCmdLine();
                done.fail();
            } catch(error) {
                console.log(error);
                expect(error).toBeDefined();
                done();
            }
        });
        
        it('should throw an error for invalid group', function(done) {
            process.argv = ['', '', '-c', 'mockConfig', '-i', '0', '-u', 'sixxy', '-g', ''];
            try {
                bootstrapper.parseCmdLine();
                done.fail();
            } catch(error) {
                expect(error).toBeDefined();
                done();
            }
        });
    });
});
