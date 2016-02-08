'use strict';

var KclBootstrapper = require('../../src/KclBootstrapper.js');
var childProcess = require('child_process');

describe('KclBootstrapper.js', function() {
    var bootstrapper;
    var mockChild;

    beforeEach(function() {
        bootstrapper = new KclBootstrapper();
        mockChild = {
            on: jasmine.createSpy('on'),
            kill: jasmine.createSpy('kill')
        };
        spyOn(bootstrapper, 'parseCmdLine');
        spyOn(childProcess, 'spawn');
        spyOn(process, 'setgid');
        spyOn(process, 'setuid');
        spyOn(process, 'exit');
        spyOn(process, 'on');
    });
    
    describe('run', function() {
        beforeEach(function() {
            bootstrapper.parseCmdLine.and.returnValue({
                java: '/usr/bin/java',
                properties: 'mld.properties',
                user: 'user',
                group: 'group'
            });
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
            process.argv = ['', '', '-j', 'java', '-p', 'properties', '-u', 'sixxy', '-g', 'sixxy'];
            var options = bootstrapper.parseCmdLine();
            expect(options).toEqual({
                java: 'java',
                properties: 'properties',
                user: 'sixxy',
                group: 'sixxy'
            });
        });
        
        it('should throw an error for invalid java path', function(done) {
            process.argv = ['', '', '-j', '', '-p', 'properties', '-u', 'sixxy', '-g', 'sixxy'];
            try {
                bootstrapper.parseCmdLine();
                done.fail();
            } catch(error) {
                expect(error).toBeDefined();
                done();
            }
        });
        
        it('should throw an error for invalid properties path', function(done) {
            process.argv = ['', '', '-j', 'java', '-p', '', '-u', 'sixxy', '-g', 'sixxy'];
            try {
                bootstrapper.parseCmdLine();
                done.fail();
            } catch(error) {
                expect(error).toBeDefined();
                done();
            }
        });
        
        it('should throw an error for invalid user', function(done) {
            process.argv = ['', '', '-j', 'java', '-p', 'properties', '-u', '', '-g', 'sixxy'];
            try {
                bootstrapper.parseCmdLine();
                done.fail();
            } catch(error) {
                expect(error).toBeDefined();
                done();
            }
        });
        
        it('should throw an error for invalid group', function(done) {
            process.argv = ['', '', '-j', 'java', '-p', 'properties', '-u', 'sixxy', '-g', ''];
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
