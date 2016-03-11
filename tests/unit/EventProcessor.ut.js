'use strict';

var CloudWatchReporter = require('cwrx/lib/cloudWatchReporter.js');
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
        spyOn(CloudWatchReporter.prototype, 'autoflush');
        spyOn(CloudWatchReporter.prototype, 'flush');
        spyOn(CloudWatchReporter.prototype, 'on');
        spyOn(CloudWatchReporter.prototype, 'removeAllListeners');
    });

    describe('the constructor', function() {
        it('should set the config, name, and actions', function() {
            expect(eventProcessor.config).toBe('config');
            expect(eventProcessor.name).toBe('time');
            expect(eventProcessor.actions).toEqual({ });
            expect(eventProcessor.cloudWatchReporters).toEqual({ });
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

        describe('filtering actions based on the ifData hash', function() {
            beforeEach(function() {
                eventProcessor.actions = {
                    'good_action': mockGoodAction,
                    'bad_action': mockBadAction
                };
            });

            it('should not filter actions without an ifData', function(done) {
                eventProcessor.handleEvent({
                    name: 'tick',
                    data: 'data'
                }, {
                    actions: [
                        'good_action',
                        'bad_action'
                    ]
                }).then(function() {
                    expect(mockGoodAction).toHaveBeenCalled();
                    expect(mockBadAction).toHaveBeenCalled();
                }).then(done, done.fail);
            });

            it('should filter actions that do not match some of the ifData', function(done) {
                eventProcessor.handleEvent({
                    name: 'tick',
                    data: {
                        foo: 'foo@bar 123'
                    }
                }, {
                    actions: [
                        {
                            name: 'good_action',
                            ifData: {
                                foo: '^foo@.* \\d{3}$'
                            }
                        },
                        {
                            name: 'bad_action',
                            ifData: {
                                foo: '^foo@.* \\d{4}$'
                            }
                        }
                    ]
                }).then(function() {
                    expect(mockGoodAction).toHaveBeenCalled();
                    expect(mockBadAction).not.toHaveBeenCalled();
                }).then(done, done.fail);
            });

            it('should not filter actions that match the ifData', function(done) {
                eventProcessor.handleEvent({
                    name: 'tick',
                    data: {
                        foo: 'foo@bar 123'
                    }
                }, {
                    actions: [
                        {
                            name: 'good_action',
                            ifData: {
                                foo: '^foo@.* \\d{3}$'
                            }
                        },
                        {
                            name: 'bad_action',
                            ifData: {
                                foo: '^foo@.* \\d{3}$'
                            }
                        }
                    ]
                }).then(function() {
                    expect(mockGoodAction).toHaveBeenCalled();
                    expect(mockBadAction).toHaveBeenCalled();
                }).then(done, done.fail);
            });

            it('should filter actions who do not have the properties required by ifData',
                    function(done) {
                eventProcessor.handleEvent({
                    name: 'tick',
                    data: { }
                }, {
                    actions: [
                        {
                            name: 'good_action',
                            ifData: {
                                foo: '.*'
                            }
                        },
                        {
                            name: 'bad_action',
                            ifData: {
                                foo: '.*'
                            }
                        }
                    ]
                }).then(function() {
                    expect(mockGoodAction).not.toHaveBeenCalled();
                    expect(mockBadAction).not.toHaveBeenCalled();
                }).then(done, done.fail);
            });
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

        it('should push metrics to cloudWatch for actions that succeed', function(done) {
            var pushGoodAction = jasmine.createSpy('pushGoodAction()');
            var pushBadAction = jasmine.createSpy('pushBadAction()');
            eventProcessor.actions = {
                'good_action': mockGoodAction,
                'bad_action': mockBadAction
            };
            eventProcessor.cloudWatchReporters = {
                'good_action': {
                    push: pushGoodAction
                },
                'bad_action': {
                    push: pushBadAction
                }
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
                expect(pushGoodAction).toHaveBeenCalledWith(jasmine.any(Number));
                expect(pushBadAction).not.toHaveBeenCalled();
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
        var loadedReporters;

        beforeEach(function() {
            eventProcessor.loadActions.and.callThrough();
            eventProcessor.config = {
                eventHandlers: {
                    tick: {
                        actions: ['action3', 'action4']
                    }
                },
                cloudWatch: {
                    namespace: 'namespace',
                    region: 'region',
                    dimensions: 'dimensions',
                    sendInterval: 1000,
                    action3: {
                        sendInterval: 2000
                    }
                }
            };
            eventProcessor.loadActions();
            loadedActions = { };
            loadedReporters = { };
            Object.keys(eventProcessor.actions).forEach(function(action) {
                loadedActions[action] = eventProcessor.actions[action];
            });
            Object.keys(eventProcessor.cloudWatchReporters).forEach(function(action) {
                loadedReporters[action] = eventProcessor.cloudWatchReporters[action];
            });
        });

        it('should be able to load actions', function() {
            expect(eventProcessor.actions.action3).toContain('my name is mock action three');
            expect(eventProcessor.actions.action4).toContain('my name is mock action four');
        });

        it('should be able to load all enabled cloudWatch reporters', function() {
            expect(eventProcessor.cloudWatchReporters.action3).toEqual(
                jasmine.any(CloudWatchReporter));
            expect(eventProcessor.cloudWatchReporters.action3.namespace).toBe('namespace');
            expect(eventProcessor.cloudWatchReporters.action3.metricData).toEqual({
                MetricName: 'action3-Time',
                Unit: 'Milliseconds',
                Dimensions: 'dimensions'
            });
            expect(eventProcessor.cloudWatchReporters.action3.on).toHaveBeenCalledWith('flush',
                jasmine.any(Function));
            expect(eventProcessor.cloudWatchReporters.action3.autoflush)
                .toHaveBeenCalledWith(2000);
            expect(eventProcessor.cloudWatchReporters.action4).toEqual(
                jasmine.any(CloudWatchReporter));
            expect(eventProcessor.cloudWatchReporters.action4.namespace).toBe('namespace');
            expect(eventProcessor.cloudWatchReporters.action4.metricData).toEqual({
                MetricName: 'action4-Time',
                Unit: 'Milliseconds',
                Dimensions: 'dimensions'
            });
            expect(eventProcessor.cloudWatchReporters.action4.on).toHaveBeenCalledWith('flush',
                jasmine.any(Function));
            expect(eventProcessor.cloudWatchReporters.action4.autoflush)
                .toHaveBeenCalledWith(1000);
        });

        describe('reloading actions at some point in the future', function() {
            beforeEach(function() {
                eventProcessor.config.eventHandlers = {
                    tick: {
                        actions: ['action1', 'action2']
                    },
                    foo: {
                        actions: [{
                            name: 'action3'
                        }]
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

        describe('reloading cloudWatch reporters at some point in the future', function() {
            beforeEach(function() {
                eventProcessor.config.eventHandlers = {
                    tick: {
                        actions: ['action1', 'action2']
                    },
                    foo: {
                        actions: [{ name: 'action3' }, { name: 'action4' }]
                    }
                };
                eventProcessor.config.cloudWatch.action4 = {
                    enabled: false
                };
                CloudWatchReporter.prototype.autoflush.calls.reset();
                CloudWatchReporter.prototype.flush.calls.reset();
                eventProcessor.loadActions();
            });

            it('should create a reporter for newly added actions', function() {
                expect(eventProcessor.cloudWatchReporters.action1).toEqual(
                    jasmine.any(CloudWatchReporter));
                expect(eventProcessor.cloudWatchReporters.action1.namespace).toBe('namespace');
                expect(eventProcessor.cloudWatchReporters.action1.metricData).toEqual({
                    MetricName: 'action1-Time',
                    Unit: 'Milliseconds',
                    Dimensions: 'dimensions'
                });
                expect(eventProcessor.cloudWatchReporters.action1.on).toHaveBeenCalledWith('flush',
                    jasmine.any(Function));
                expect(eventProcessor.cloudWatchReporters.action1.autoflush)
                    .toHaveBeenCalledWith(1000);
                expect(eventProcessor.cloudWatchReporters.action2).toEqual(
                    jasmine.any(CloudWatchReporter));
                expect(eventProcessor.cloudWatchReporters.action2.namespace).toBe('namespace');
                expect(eventProcessor.cloudWatchReporters.action2.metricData).toEqual({
                    MetricName: 'action2-Time',
                    Unit: 'Milliseconds',
                    Dimensions: 'dimensions'
                });
                expect(eventProcessor.cloudWatchReporters.action2.on).toHaveBeenCalledWith('flush',
                    jasmine.any(Function));
                expect(eventProcessor.cloudWatchReporters.action2.autoflush)
                    .toHaveBeenCalledWith(1000);
            });

            it('should update existing reporters', function() {
                expect(eventProcessor.cloudWatchReporters.action3.autoflush)
                    .toHaveBeenCalledWith(2000);
            });

            it('should remove unused reporters', function() {
                expect(loadedReporters.action4.autoflush).toHaveBeenCalledWith(0);
                expect(loadedReporters.action4.flush).toHaveBeenCalled();
                expect(loadedReporters.action4.removeAllListeners).toHaveBeenCalled();
                expect(eventProcessor.cloudWatchReporters.action4).not.toBeDefined();
            });
        });
    });
});
