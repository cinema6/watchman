'use strict';

var ActionsReporter;
var proxyquire = require('proxyquire').noCallThru();

describe('ActionsReporter', function() {
    beforeEach(function() {
        this.mockConfig = {
            namespace: 'namespace',
            dimensions: 'dimensions',
            region: 'region',
            sendInterval: 1000
        };
        this.MockCloudWatchReporter = jasmine.createSpy('constructor');
        this.MockCloudWatchReporter.prototype = {
            flush: jasmine.createSpy('flush'),
            push : jasmine.createSpy('push')
        };
        ActionsReporter = proxyquire('../../lib/ActionsReporter.js', {
            'cwrx/lib/cloudWatchReporter.js': this.MockCloudWatchReporter
        });
        this.reporter = new ActionsReporter(this.mockConfig);
        spyOn(this.reporter, 'enableReportingForActions');
        spyOn(this.reporter, 'disableReportingForActions');
        spyOn(this.reporter, 'flush');
        jasmine.clock().install();
    });

    afterEach(function() {
        jasmine.clock().uninstall();
    });

    describe('the constructor', function() {
        it('should initialize properties', function() {
            expect(this.reporter.config).toEqual(this.mockConfig);
            expect(this.reporter.interval).toBeNull();
            expect(this.reporter.reporters).toEqual({ });
        });
    });

    describe('updateReportingActions', function() {
        beforeEach(function() {
            this.reporter.reporters = {
                action1: null,
                action2: null,
                action3: null
            };
            this.reporter.updateReportingActions(['action3', 'action4', 'action5']);
        });

        it('should enable reporting for the given actions', function() {
            expect(this.reporter.enableReportingForActions).toHaveBeenCalledWith(['action3', 'action4', 'action5']);
        });

        it('should disable reporting for unused actions', function() {
            expect(this.reporter.disableReportingForActions).toHaveBeenCalledWith(['action1', 'action2']);
        });
    });

    describe('enableReportingForActions', function() {
        beforeEach(function() {
            this.reporter.enableReportingForActions.and.callThrough();
            this.reporter.reporters = {
                action1: 'reporter'
            };
        });

        it('should create reporters if needed for the given actions', function() {
            this.reporter.enableReportingForActions(['action1', 'action2']);
            expect(this.MockCloudWatchReporter.calls.count()).toBe(1);
            expect(this.MockCloudWatchReporter).toHaveBeenCalledWith('namespace', {
                MetricName: 'action2-Time',
                Unit: 'Milliseconds',
                Dimensions: 'dimensions'
            }, {
                region: 'region'
            });
            expect(this.reporter.reporters.action2).toEqual(jasmine.any(this.MockCloudWatchReporter));
        });
    });

    describe('disableReportingForActions', function() {
        beforeEach(function() {
            this.mockReporter = new this.MockCloudWatchReporter();
            this.reporter.disableReportingForActions.and.callThrough();
            this.reporter.reporters = {
                action1: this.mockReporter
            };
        });

        it('should flush and delete reporters for the given actions', function() {
            this.reporter.disableReportingForActions(['action1', 'action2']);
            expect(this.mockReporter.flush).toHaveBeenCalledWith();
            expect(this.MockCloudWatchReporter.prototype.flush.calls.count()).toBe(1);
            expect(this.reporter.reporters.action1).not.toBeDefined();
            expect(this.reporter.reporters.action2).not.toBeDefined();
        });
    });

    describe('pushMetricForAction', function() {
        beforeEach(function() {
            this.mockReporter = new this.MockCloudWatchReporter();
            this.reporter.reporters = {
                action1: this.mockReporter
            };
        });

        it('should push metric data to the reporter for the given action', function() {
            this.reporter.pushMetricForAction('action1', 'metric');
            expect(this.mockReporter.push).toHaveBeenCalledWith('metric');
        });

        it('should do nothing', function() {
            this.reporter.pushMetricForAction('action2', 'metric');
            expect(this.MockCloudWatchReporter.prototype.push).not.toHaveBeenCalled();
        });
    });

    describe('autoflush', function() {
        it('should setup an interval', function() {
            this.reporter.autoflush(true);
            expect(this.reporter.interval).toBeDefined();
            expect(this.reporter.flush).not.toHaveBeenCalled();
            jasmine.clock().tick(1000);
            expect(this.reporter.flush).toHaveBeenCalledWith();
            expect(this.reporter.flush.calls.count()).toBe(1);
            jasmine.clock().tick(1000);
            expect(this.reporter.flush.calls.count()).toBe(2);
            jasmine.clock().tick(1000);
            expect(this.reporter.flush.calls.count()).toBe(3);
        });

        it('should not set an interval if one already exists', function() {
            this.reporter.interval = 'defined';
            this.reporter.autoflush(true);
            expect(this.reporter.interval).toBe('defined');
        });

        it('should be able to cancel the interval', function() {
            this.reporter.autoflush(true);
            jasmine.clock().tick(1000);
            expect(this.reporter.flush).toHaveBeenCalled();
            this.reporter.flush.calls.reset();
            this.reporter.autoflush(false);
            expect(this.reporter.flush).toHaveBeenCalled();
            jasmine.clock().tick(1000);
            expect(this.reporter.flush.calls.count()).toBe(1);
            jasmine.clock().tick(1000);
            expect(this.reporter.flush.calls.count()).toBe(1);
        });

        it('should not flush if cancelling a non-existant interval', function() {
            this.reporter.autoflush(false);
            expect(this.reporter.flush).not.toHaveBeenCalled();
        });
    });

    describe('flush', function() {
        beforeEach(function() {
            this.reporter.flush.and.callThrough();
            this.mockReporter1 = new this.MockCloudWatchReporter();
            this.mockReporter2 = new this.MockCloudWatchReporter();
            this.reporter.reporters = {
                action1: this.mockReporter1,
                action2: this.mockReporter2
            };
        });

        it('should flush each reporter', function() {
            this.reporter.flush();
            expect(this.mockReporter1.flush).toHaveBeenCalled();
            expect(this.mockReporter2.flush).toHaveBeenCalled();
        });
    });
});
