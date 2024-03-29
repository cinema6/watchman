'use strict';

var action;
var log = require('../../src/actions/message/log.js');
var logger = require('cwrx/lib/logger.js');

describe('log action', function() {
    beforeEach(function() {
        this.mockConfig = {

        };
        this.mockLog = {
            trace: jasmine.createSpy('trace()'),
            info: jasmine.createSpy('info()'),
            warn: jasmine.createSpy('warn()'),
            error: jasmine.createSpy('error()')
        };
        spyOn(logger, 'getLog').and.returnValue(this.mockLog);
        action = log(this.mockConfig);
    });

    it('should exist', function() {
        expect(log).toEqual(jasmine.any(Function));
        expect(log.name).toBe('logFactory');
        expect(action).toEqual(jasmine.any(Function));
        expect(action.name).toBe('logAction');
    });

    it('should get the logger', function(done) {
        action({ data: { }, options: { } }).then(function() {
            expect(logger.getLog).toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should default the text and log level', function(done) {
        var self = this;
        action({ data: { }, options: { } }).then(function() {
            expect(self.mockLog.trace).toHaveBeenCalledWith('');
        }).then(done, done.fail);
    });

    it('should support setting the text and level options', function(done) {
        var self = this;
        action({ data: { }, options: { text: 'Hello World!', level: 'info' } }).then(function() {
            expect(self.mockLog.info).toHaveBeenCalledWith('Hello World!');
        }).then(done, done.fail);
    });

    it('should reject for unsupported log levels', function(done) {
        action({ data: { }, options: { text: 'Hello World!', level: 'foo' } }).then(done.fail).catch(function(error) {
            expect(error).toBeDefined();
        }).then(done, done.fail);
    });

    it('should support dynamic log text', function(done) {
        var event = {
            data: {
                firstName: 'Bruce',
                lastName: 'Wayne'
            },
            options: {
                text: 'Hello {{firstName}} {{lastName}}, are you Batman?',
                level: 'error'
            }
        };
        var self = this;

        action(event).then(function() {
            expect(self.mockLog.error).toHaveBeenCalledWith('Hello Bruce Wayne, are you Batman?');
        }).then(done, done.fail);
    });
});
