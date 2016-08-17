'use strict';

var EventProcessor;
var Q = require('q');
var logger = require('cwrx/lib/logger.js');
var proxyquire = require('proxyquire').noCallThru();

describe('EventProcessor.js', function() {
    beforeEach(function() {
        this.mockLog = {
            trace: jasmine.createSpy('trace()'),
            info: jasmine.createSpy('info()'),
            warn: jasmine.createSpy('warn()'),
            error: jasmine.createSpy('error()')
        };
        this.mockGoodAction = jasmine.createSpy('mockGoodAction()').and.returnValue(Q.resolve());
        this.mockBadAction = jasmine.createSpy('mockBadAction()').and.returnValue(Q.reject());
        this.MockActionsReporter = jasmine.createSpy('MockActionsReporter()');
        this.MockActionsReporter.prototype = {
            autoflush: jasmine.createSpy('autoflush()'),
            pushMetricForAction: jasmine.createSpy('pushMetricForAction()'),
            updateReportingActions: jasmine.createSpy('updateReportingActions()')
        };
        EventProcessor = proxyquire('../../src/event_processors/EventProcessor.js', {
            '../../lib/ActionsReporter.js': this.MockActionsReporter
        });
        spyOn(EventProcessor.prototype, 'loadActions');
        this.eventProcessor = new EventProcessor('time', 'config');
        spyOn(this.eventProcessor, 'getActionPath').and.callFake(function(actionName) {
            return '../../tests/helpers/' + actionName + '.js';
        });
        spyOn(this.eventProcessor, 'handleEvent').and.callThrough();
        spyOn(this.eventProcessor, 'recordToEvent').and.callThrough();
        spyOn(logger, 'getLog').and.returnValue(this.mockLog);
    });

    describe('the constructor', function() {
        it('should set the config, name, and actions', function() {
            expect(this.eventProcessor.config).toBe('config');
            expect(this.eventProcessor.name).toBe('time');
            expect(this.eventProcessor.actions).toEqual({ });
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
            expect(this.eventProcessor.loadActions).toHaveBeenCalledWith();
        });

        it('should initialize the actions reporter', function() {
            expect(this.eventProcessor.reporter).toEqual(jasmine.any(this.MockActionsReporter));
            expect(this.eventProcessor.reporter.autoflush).toHaveBeenCalledWith(true);
        });
    });

    describe('the process method', function() {
        beforeEach(function() {
            this.eventProcessor.config = {
                eventHandlers: {
                    tick: {
                        actions: []
                    }
                }
            };
        });

        it('should be able to process and handle a record', function(done) {
            var self = this;
            self.eventProcessor.recordToEvent.and.returnValue({ name: 'tick' });
            self.eventProcessor.handleEvent.and.returnValue(Q.resolve());
            self.eventProcessor.process({ foo: 'bar' }).then(function() {
                expect(self.eventProcessor.recordToEvent).toHaveBeenCalledWith({ foo: 'bar' });
                expect(self.eventProcessor.handleEvent).toHaveBeenCalledWith({ name: 'tick' },
                    { actions: [] });
                done();
            }).catch(done.fail);
        });

        it('should not handle unmappable records', function(done) {
            var self = this;
            self.eventProcessor.recordToEvent.and.returnValue(null);
            self.eventProcessor.process({ foo: 'bar' }).then(function() {
                expect(self.eventProcessor.recordToEvent).toHaveBeenCalledWith({ foo: 'bar' });
                expect(self.eventProcessor.handleEvent).not.toHaveBeenCalled();
                done();
            }).catch(done.fail);
        });

        it('should not handle unsupported events', function(done) {
            var self = this;
            self.eventProcessor.recordToEvent.and.returnValue('unsupported');
            self.eventProcessor.process({ foo: 'bar' }).then(function() {
                expect(self.eventProcessor.recordToEvent).toHaveBeenCalledWith({ foo: 'bar' });
                expect(self.eventProcessor.handleEvent).not.toHaveBeenCalled();
                done();
            }).catch(done.fail);
        });
    });

    describe('the handleEvent method', function() {
        it('should not attempt to handle events with no actions', function(done) {
            var self = this;
            self.eventProcessor.handleEvent({ name: 'tick' }, { actions: [] }).then(function() {
                expect(self.mockLog.info).not.toHaveBeenCalled();
                done();
            }).catch(done.fail);
        });

        describe('filtering actions based on the ifData hash', function() {
            beforeEach(function() {
                this.eventProcessor.actions = {
                    'good_action': this.mockGoodAction,
                    'bad_action': this.mockBadAction
                };
            });

            it('should not filter actions without an ifData', function(done) {
                var self = this;
                self.eventProcessor.handleEvent({
                    name: 'tick',
                    data: 'data'
                }, {
                    actions: [
                        'good_action',
                        'bad_action'
                    ]
                }).then(function() {
                    expect(self.mockGoodAction).toHaveBeenCalled();
                    expect(self.mockBadAction).toHaveBeenCalled();
                }).then(done, done.fail);
            });

            it('should filter actions that do not match some of the ifData', function(done) {
                var self = this;
                self.eventProcessor.handleEvent({
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
                    expect(self.mockGoodAction).toHaveBeenCalled();
                    expect(self.mockBadAction).not.toHaveBeenCalled();
                }).then(done, done.fail);
            });

            it('should not filter actions that match the ifData', function(done) {
                var self = this;
                self.eventProcessor.handleEvent({
                    name: 'tick',
                    data: {
                        foo: 'foo@bar 123',
                        baz: {
                            value: 777
                        }
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
                                foo: '^foo@.* \\d{3}$',
                                'baz.value': 777
                            }
                        }
                    ]
                }).then(function() {
                    expect(self.mockGoodAction).toHaveBeenCalled();
                    expect(self.mockBadAction).toHaveBeenCalled();
                }).then(done, done.fail);
            });
        });

        it('should perform the configured list of actions', function(done) {
            var self = this;
            self.eventProcessor.actions = {
                'good_action': self.mockGoodAction,
                'bad_action': self.mockBadAction
            };
            self.eventProcessor.handleEvent({
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
                expect(self.mockGoodAction).toHaveBeenCalledWith({ data: 'data', options: 'options' });
                expect(self.mockBadAction).toHaveBeenCalledWith({ data: 'data', options: { } });
                done();
            }).catch(done.fail);
        });

        describe('when some actions fail', function() {
            it('should log a warning but still resolve if the action promise rejects', function(done) {
                var self = this;
                self.eventProcessor.actions = {
                    'good_action': self.mockGoodAction,
                    'bad_action': self.mockBadAction
                };
                self.eventProcessor.handleEvent({
                    name: 'tick'
                }, {
                    actions: ['good_action', 'bad_action']
                }).then(function() {
                    expect(self.mockLog.warn.calls.count()).toBe(1);
                    done();
                }).catch(done.fail);
            });

            it('should log a warning but still resolve if an error occurs running the action', function(done) {
                var self = this;
                self.eventProcessor.actions = {
                    'good_action': self.mockGoodAction,
                    'bad_action': function() {
                        throw new Error('fail whale');
                    }
                };
                self.eventProcessor.handleEvent({
                    name: 'tick'
                }, {
                    actions: ['good_action', 'bad_action']
                }).then(function() {
                    expect(self.mockLog.warn.calls.count()).toBe(1);
                    done();
                }).catch(done.fail);
            });
        });

        it('should push metrics to the actions reporter for actions that succeed', function(done) {
            var self = this;
            self.eventProcessor.actions = {
                'good_action': self.mockGoodAction,
                'bad_action': self.mockBadAction
            };
            self.eventProcessor.handleEvent({
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
                expect(self.eventProcessor.reporter.pushMetricForAction).toHaveBeenCalledWith('good_action', jasmine.any(Number));
                expect(self.eventProcessor.reporter.pushMetricForAction.calls.count()).toBe(1);
                done();
            }).catch(done.fail);
        });
    });

    describe('the recordToEvent method', function() {
        it('should return null', function() {
            expect(this.eventProcessor.recordToEvent()).toBeNull();
        });
    });

    describe('the loadActions method', function() {
        beforeEach(function() {
            var self = this;
            self.eventProcessor.loadActions.and.callThrough();
            self.eventProcessor.config = {
                eventHandlers: {
                    tick: {
                        actions: ['action3', {
                            name: 'action4',
                            options: {
                                reporting: false
                            }
                        }]
                    }
                },
                cloudWatch: {
                    namespace: 'namespace',
                    region: 'region',
                    dimensions: 'dimensions',
                    sendInterval: 1000
                }
            };
            self.eventProcessor.loadActions();

            self.action1Factory = require('../helpers/action1');
            self.action2Factory = require('../helpers/action2');
            self.action3Factory = require('../helpers/action3');
            self.action4Factory = require('../helpers/action4');

            self.loadedActions = { };
            self.loadedReporters = { };
            Object.keys(self.eventProcessor.actions).forEach(function(action) {
                self.loadedActions[action] = self.eventProcessor.actions[action];
            });
        });

        it('should call the factory function for each action', function() {
            expect(this.action3Factory).toHaveBeenCalledWith(this.eventProcessor.config);
            expect(this.action4Factory).toHaveBeenCalledWith(this.eventProcessor.config);
        });

        it('should be able to load actions', function() {
            expect(this.eventProcessor.actions.action3).toContain('my name is mock action three');
            expect(this.eventProcessor.actions.action4).toContain('my name is mock action four');
        });

        it('should update the actions for the actions reporter', function() {
            expect(this.eventProcessor.reporter.updateReportingActions).toHaveBeenCalledWith(['action3']);
        });

        describe('reloading actions at some point in the future', function() {
            beforeEach(function() {
                this.eventProcessor.config.eventHandlers = {
                    tick: {
                        actions: ['action1', 'action2']
                    },
                    foo: {
                        actions: [{
                            name: 'action3'
                        }]
                    }
                };
                this.eventProcessor.loadActions();

                this.action1Factory = require('../helpers/action1');
                this.action2Factory = require('../helpers/action2');
                this.action3Factory = require('../helpers/action3');
                this.action4Factory = require('../helpers/action4');
            });

            it('should call the factory function for each action', function() {
                expect(this.action1Factory).toHaveBeenCalledWith(this.eventProcessor.config);
                expect(this.action2Factory).toHaveBeenCalledWith(this.eventProcessor.config);
            });

            it('should require newly added actions', function() {
                expect(this.eventProcessor.actions.action1).toContain('my name is mock action one');
                expect(this.eventProcessor.actions.action2).toContain('my name is mock action two');
            });

            it('should update existing actions', function() {
                expect(this.eventProcessor.actions.action3).toContain('my name is mock action three');
                expect(this.eventProcessor.actions.action3).not.toBe(this.loadedActions.action3);
            });

            it('should remove unused actions', function() {
                expect(this.eventProcessor.actions.action4).not.toBeDefined();
            });
        });
    });
});
