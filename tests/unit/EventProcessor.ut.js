'use strict';

var EventProcessor = require('../../src/event_processors/EventProcessor.js');
var Q = require('q');
var logger = require('cwrx/lib/logger.js');

describe('EventProcessor.js', function() {
    var eventProcessor;
    var mockLog;
    var mockGoodAction;
    var mockBadAction;
    
    beforeEach(function() {
        mockLog = {
            trace: jasmine.createSpy('trace()'),
            info: jasmine.createSpy('info()'),
            warn: jasmine.createSpy('warn()'),
            error: jasmine.createSpy('error()')
        };
        mockGoodAction = jasmine.createSpy('mockGoodAction()').and.returnValue(Q.resolve());
        mockBadAction = jasmine.createSpy('mockBadAction()').and.returnValue(Q.reject());
        spyOn(EventProcessor.prototype, 'loadActions');
        eventProcessor = new EventProcessor('time', 'config');
        spyOn(eventProcessor, 'getActionPath').and.callFake(function(actionName) {
            return '../../tests/helpers/' + actionName + '.js';
        });
        spyOn(eventProcessor, 'handleEvent').and.callThrough();
        spyOn(eventProcessor, 'recordToEvent').and.callThrough();
        spyOn(logger, 'getLog').and.returnValue(mockLog);
    });
    
    describe('the constructor', function() {
        it('should set the config, name, and actions', function() {
            expect(eventProcessor.config).toBe('config');
            expect(eventProcessor.name).toBe('time');
            expect(eventProcessor.actions).toEqual({ });
        });
        
        it('should throw an error if not provided with a name', function() {
            var error = null;
            try {
                new EventProcessor(null, 'config');
            } catch(err) {
                error = err;
            }
            expect(error).not.toBeNull();
        });
        
        it('should throw an error if not provided with a config', function() {
            var error = null;
            try {
                new EventProcessor('name', null);
            } catch(err) {
                error = err;
            }
            expect(error).not.toBeNull();
        });
        
        it('should load the required actions', function() {
            expect(eventProcessor.loadActions).toHaveBeenCalledWith();
        });
    });
    
    describe('the process method', function() {
        beforeEach(function() {
            eventProcessor.config = {
                eventHandlers: {
                    tick: {
                        actions: []
                    }
                }
            };
        });

        it('should be able to process and handle a record', function(done) {
            eventProcessor.recordToEvent.and.returnValue({ name: 'tick' });
            eventProcessor.handleEvent.and.returnValue(Q.resolve());
            eventProcessor.process({ foo: 'bar' }).then(function() {
                expect(eventProcessor.recordToEvent).toHaveBeenCalledWith({ foo: 'bar' });
                expect(eventProcessor.handleEvent).toHaveBeenCalledWith({ name: 'tick' },
                    { actions: [] });
                done();
            }).catch(done.fail);
        });
        
        it('should not handle unmappable records', function(done) {
            eventProcessor.recordToEvent.and.returnValue(null);
            eventProcessor.process({ foo: 'bar' }).then(function() {
                expect(eventProcessor.recordToEvent).toHaveBeenCalledWith({ foo: 'bar' });
                expect(eventProcessor.handleEvent).not.toHaveBeenCalled();
                done();
            }).catch(done.fail);
        });
        
        it('should not handle unsupported events', function(done) {
            eventProcessor.recordToEvent.and.returnValue('unsupported');
            eventProcessor.process({ foo: 'bar' }).then(function() {
                expect(eventProcessor.recordToEvent).toHaveBeenCalledWith({ foo: 'bar' });
                expect(eventProcessor.handleEvent).not.toHaveBeenCalled();
                done();
            }).catch(done.fail);
        });
    });
    
    describe('the handleEvent method', function() {
        it('should not attempt to handle events with no actions', function(done) {
            eventProcessor.handleEvent({ name: 'tick' }, { actions: [] }).then(function() {
                expect(mockLog.info).not.toHaveBeenCalled();
                done();
            }).catch(done.fail);
        });
        
        it('should perform the configured list of actions', function(done) {
            eventProcessor.actions = {
                'good_action': mockGoodAction,
                'bad_action': mockBadAction
            };
            eventProcessor.handleEvent({
                name: 'tick',
                data: 'data'
            }, {
                actions: [
                    {
                        name: 'good_action',
                        options: 'options'
                    },
                    'bad_action'
                ]
            }).then(function() {
                expect(mockGoodAction).toHaveBeenCalledWith('data', 'options',
                    eventProcessor.config);
                expect(mockBadAction).toHaveBeenCalledWith('data', null, eventProcessor.config);
                done();
            }).catch(done.fail);
        });
        
        it('log a warning but still resolve if some actions fail', function(done) {
            eventProcessor.actions = {
                'good_action': mockGoodAction,
                'bad_action': mockBadAction
            };
            eventProcessor.handleEvent({
                name: 'tick'
            }, {
                actions: ['good_action', 'bad_action']
            }).then(function() {
                expect(mockLog.warn.calls.count()).toBe(1);
                done();
            }).catch(done.fail);
        });
    });
    
    describe('the recordToEvent method', function() {
        it('should return null', function() {
            expect(eventProcessor.recordToEvent()).toBeNull();
        });
    });
    
    describe('the loadActions method', function() {
        var loadedActions;
        
        beforeEach(function() {
            eventProcessor.loadActions.and.callThrough();
            eventProcessor.config = {
                eventHandlers: {
                    tick: {
                        actions: ['action3', 'action4']
                    }
                }
            };
            eventProcessor.loadActions();
            loadedActions = { };
            Object.keys(eventProcessor.actions).forEach(function(action) {
                loadedActions[action] = eventProcessor.actions[action];
            });
        });

        it('should be able to load actions', function() {
            expect(eventProcessor.actions.action3).toContain('my name is mock action three');
            expect(eventProcessor.actions.action4).toContain('my name is mock action four');
        });
        
        describe('reloading actions at some point in the future', function() {
            beforeEach(function() {
                eventProcessor.config = {
                    eventHandlers: {
                        tick: {
                            actions: ['action1', 'action2']
                        },
                        foo: {
                            actions: [{
                                name: 'action3'
                            }]
                        }
                    }
                };
                eventProcessor.loadActions();
            });
            
            it('should require newly added actions', function() {
                expect(eventProcessor.actions.action1).toContain('my name is mock action one');
                expect(eventProcessor.actions.action2).toContain('my name is mock action two');
            });
            
            it('should update existing actions', function() {
                expect(eventProcessor.actions.action3).toContain('my name is mock action three');
                expect(eventProcessor.actions.action3).not.toBe(loadedActions.action3);
            });
            
            it('should remove unused actions', function() {
                expect(eventProcessor.actions.action4).not.toBeDefined();
            });
        });
    });
});
