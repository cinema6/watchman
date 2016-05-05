'use strict';

var CwrxRequest;
var Q = require('q');
var logger;
var proxyquire = require('proxyquire').noCallThru();
var setStatusFactory;

describe('set_status.js', function() {
    var setStatus;
    var mockLog;
    var mockData;
    var mockOptions;
    var mockConfig;

    beforeEach(function() {
        CwrxRequest = jasmine.createSpy('constructor');
        CwrxRequest.prototype = {
            put: jasmine.createSpy('put')
        };
        mockLog = {
            trace: jasmine.createSpy('trace()'),
            info: jasmine.createSpy('info()'),
            warn: jasmine.createSpy('warn()'),
            error: jasmine.createSpy('error()')
        };
        logger = {
            getLog: function() {
                return mockLog;
            }
        };
        setStatusFactory = proxyquire('../../src/actions/set_status.js', {
            '../../lib/CwrxRequest.js': CwrxRequest,
            'cwrx/lib/logger.js': logger
        });

        mockData = { };
        mockOptions = { };
        mockConfig = {
            cwrx: {
                api: {
                    root: 'http://hostname',
                    auth: {
                        endpoint: '/api/auth'
                    },
                    campaigns: {
                        endpoint: '/api/campaigns'
                    }
                }
            },
            secrets: {
                email: 'email',
                password: 'password'
            },
            appCreds: {
                key: 'key',
                secret: 'secret'
            }
        };

        setStatus = setStatusFactory(mockConfig);
    });

    it('should create a cwrx request object', function() {
        expect(CwrxRequest).toHaveBeenCalledWith({
            key: 'key',
            secret: 'secret'
        });
    });

    it('should not attempt anything when not provided a campaign', function(done) {
        var mockDatas = [
            { },
            { campaign: { } },
            { campaign: { id: null } }
        ];
        Q.all(mockDatas.map(function(mockData) {
            return setStatus({ data: mockData, options: mockOptions });
        })).then(function() {
            expect(CwrxRequest.prototype.put).not.toHaveBeenCalled();
        }).then(done, done.fail);
    });

    it('should not attempt anything when not provided a status', function(done) {
        mockData = {
            campaign: {
                id: 'c-123'
            }
        };
        mockOptions = {
            status: null
        };
        setStatus({ data: mockData, options: mockOptions }).then(function() {
            expect(CwrxRequest.prototype.put).not.toHaveBeenCalled();
        }).then(done, done.fail);
    });

    describe('when provided a campaign', function() {
        beforeEach(function() {
            mockData = {
                campaign: {
                    id: 'c-123',
                    updateRequest: 'ur-123'
                }
            };
            mockOptions = {
                status: 'status'
            };
        });

        it('should edit the status of the campaign', function(done) {
            setStatus({ data: mockData, options: mockOptions }).then(function() {
                expect(CwrxRequest.prototype.put).toHaveBeenCalledWith({
                    url: 'http://hostname/api/campaigns/c-123',
                    json: {
                        status: 'status'
                    }
                });
            }).then(done, done.fail);
        });

        describe('when the campaign is being expired', function() {
            it('should not attempt to reject a non-existant update request', function(done) {
                delete mockData.campaign.updateRequest;
                setStatus({ data: mockData, options: mockOptions }).then(function() {
                    expect(CwrxRequest.prototype.put.calls.count()).toBe(1);
                }).then(done, done.fail);
            });

            it('should reject a pending update requests if becoming expired', function(done) {
                mockOptions.status = 'expired';
                CwrxRequest.prototype.put.and.returnValue(Q.resolve());
                setStatus({ data: mockData, options: mockOptions }).then(function() {
                    expect(CwrxRequest.prototype.put).toHaveBeenCalledWith({
                        url: 'http://hostname/api/campaigns/c-123/updates/ur-123',
                        json: {
                            status: 'rejected',
                            campaignExpired: true,
                            rejectionReason: 'Your campaign has expired. Please re-submit your request with a new end-date.'
                        }
                    });
                }).then(done, done.fail);
            });

            it('should reject a pending update request if becoming outOfBudget', function(done) {
                mockOptions.status = 'outOfBudget';
                CwrxRequest.prototype.put.and.returnValue(Q.resolve());
                setStatus({ data: mockData, options: mockOptions }).then(function() {
                    expect(CwrxRequest.prototype.put).toHaveBeenCalledWith({
                        url: 'http://hostname/api/campaigns/c-123/updates/ur-123',
                        json: {
                            status: 'rejected',
                            campaignExpired: true,
                            rejectionReason: 'Your campaign has exhausted its budget. Please re-submit your request with a new budget.'
                        }
                    });
                }).then(done, done.fail);
            });

            it('should error if rejecting the update request fails', function(done) {
                mockOptions.status = 'expired';
                CwrxRequest.prototype.put.and.callFake(function(options) {
                    return (options.url.indexOf('ur-123')) ? Q.reject() : Q.resolve();
                });
                setStatus({ data: mockData, options: mockOptions }).then(done.fail).catch(function() {
                    expect(mockLog.error).toHaveBeenCalled();
                }).then(done, done.fail);
            });
        });

        it('should error if editing the campaign status failed', function(done) {
            CwrxRequest.prototype.put.and.callFake(function(options) {
                return (options.url.indexOf('c-123')) ? Q.reject() : Q.resolve();
            });
            setStatus({ data: mockData, options: mockOptions }).then(done.fail).catch(function() {
                expect(mockLog.error).toHaveBeenCalled();
            }).then(done, done.fail);
        });
    });
});
