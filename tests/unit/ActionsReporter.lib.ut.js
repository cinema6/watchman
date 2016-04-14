'use strict';

var ActionsReporter;
var proxyquire = require('proxyquire').noCallThru();

describe('ActionsReporter', function() {
    var reporter, mockConfig, MockCloudWatchReporter;

    beforeEach(function() {
        mockConfig = {
            namespace: 'namespace',
            dimensions: 'dimensions',
            region: 'region',
            sendInterval: 1000
        };
        MockCloudWatchReporter = jasmine.createSpy('constructor');
        MockCloudWatchReporter.prototype = {
            flush: jasmine.createSpy('flush'),
            push : jasmine.createSpy('push')
        };
        ActionsReporter = proxyquire('../../lib/ActionsReporter.js', {
            'cwrx/lib/cloudWatchReporter.js': MockCloudWatchReporter
        });
        reporter = new ActionsReporter(mockConfig);
        spyOn(reporter, 'enableReportingForActions');
        spyOn(reporter, 'disableReportingForActions');
        spyOn(reporter, 'flush');
        jasmine.clock().install();
    });

    afterEach(function() {
        jasmine.clock().uninstall();
    });

    describe('the constructor', function() {
        it('should initialize properties', function() {
            expect(reporter.config).toEqual(mockConfig);
            expect(reporter.interval).toBeNull();
            expect(reporter.reporters).toEqual({ });
        });
    });

    describe('updateReportingActions', function() {
        beforeEach(function() {
            reporter.reporters = {
                action1: null,
                action2: null,
                action3: null
            };
            reporter.updateReportingActions(['action3', 'action4', 'action5']);
        });

        it('should enable reporting for the given actions', function() {
            expect(reporter.enableReportingForActions).toHaveBeenCalledWith(['action3', 'action4', 'action5']);
        });

        it('should disable reporting for unused actions', function() {
            expect(reporter.disableReportingForActions).toHaveBeenCalledWith(['action1', 'action2']);
        });
    });

    describe('enableReportingForActions', function() {
        beforeEach(function() {
            reporter.enableReportingForActions.and.callThrough();
            reporter.reporters = {
                action1: 'reporter'
            };
        });

        it('should create reporters if needed for the given actions', function() {
            reporter.enableReportingForActions(['action1', 'action2']);
            expect(MockCloudWatchReporter.calls.count()).toBe(1);
            expect(MockCloudWatchReporter).toHaveBeenCalledWith('namespace', {
                MetricName: 'action2-Time',
                Unit: 'Milliseconds',
                Dimensions: 'dimensions'
            }, {
                region: 'region'
            });
            expect(reporter.reporters.action2).toEqual(jasmine.any(MockCloudWatchReporter));
        });
    });

    describe('disableReportingForActions', function() {
        var mockReporter;

        beforeEach(function() {
            mockReporter = new MockCloudWatchReporter();
            reporter.disableReportingForActions.and.callThrough();
            reporter.reporters = {
                action1: mockReporter
            };
        });

        it('should flush and delete reporters for the given actions', function() {
            reporter.disableReportingForActions(['action1', 'action2']);
            expect(mockReporter.flush).toHaveBeenCalledWith();
            expect(MockCloudWatchReporter.prototype.flush.calls.count()).toBe(1);
            expect(reporter.reporters.action1).not.toBeDefined();
            expect(reporter.reporters.action2).not.toBeDefined();
        });
    });

    describe('pushMetricForAction', function() {
        var mockReporter;

        beforeEach(function() {
            mockReporter = new MockCloudWatchReporter();
            reporter.reporters = {
                action1: mockReporter
            };
        });

        it('should push metric data to the reporter for the given action', function() {
            reporter.pushMetricForAction('action1', 'metric');
            expect(mockReporter.push).toHaveBeenCalledWith('metric');
        });

        it('should do nothing', function() {
            reporter.pushMetricForAction('action2', 'metric');
            expect(MockCloudWatchReporter.prototype.push).not.toHaveBeenCalled();
        });
    });

    describe('autoflush', function() {
        it('should setup an interval', function() {
            reporter.autoflush(true);
            expect(reporter.interval).toBeDefined();
            expect(reporter.flush).not.toHaveBeenCalled();
            jasmine.clock().tick(1000);
            expect(reporter.flush).toHaveBeenCalledWith();
            expect(reporter.flush.calls.count()).toBe(1);
            jasmine.clock().tick(1000);
            expect(reporter.flush.calls.count()).toBe(2);
            jasmine.clock().tick(1000);
            expect(reporter.flush.calls.count()).toBe(3);
        });

        it('should not set an interval if one already exists', function() {
            reporter.interval = 'defined';
            reporter.autoflush(true);
            expect(reporter.interval).toBe('defined');
        });

        it('should be able to cancel the interval', function() {
            reporter.autoflush(true);
            jasmine.clock().tick(1000);
            expect(reporter.flush).toHaveBeenCalled();
            reporter.flush.calls.reset();
            reporter.autoflush(false);
            expect(reporter.flush).toHaveBeenCalled();
            jasmine.clock().tick(1000);
            expect(reporter.flush.calls.count()).toBe(1);
            jasmine.clock().tick(1000);
            expect(reporter.flush.calls.count()).toBe(1);
        });

        it('should not flush if cancelling a non-existant interval', function() {
            reporter.autoflush(false);
            expect(reporter.flush).not.toHaveBeenCalled();
        });
    });

    describe('flush', function() {
        var mockReporter1, mockReporter2;

        beforeEach(function() {
            reporter.flush.and.callThrough();
            mockReporter1 = new MockCloudWatchReporter();
            mockReporter2 = new MockCloudWatchReporter();
            reporter.reporters = {
                action1: mockReporter1,
                action2: mockReporter2
            };
        });

        it('should flush each reporter', function() {
            reporter.flush();
            expect(mockReporter1.flush).toHaveBeenCalled();
            expect(mockReporter2.flush).toHaveBeenCalled();
        });
    });
});
