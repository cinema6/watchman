'use strict';

var Q = require('q');
var logger = require('cwrx/lib/logger.js');
var requestUtils = require('cwrx/lib/requestUtils.js');
var setStatus = require('../../src/actions/set_status.js');

describe('set_status.js', function() {
    var mockLog;
    var mockData;
    var mockOptions;
    var mockConfig;
    var mockCampaignResponse;

    beforeEach(function() {
        mockLog = {
            trace: jasmine.createSpy('trace()'),
            info: jasmine.createSpy('info()'),
            warn: jasmine.createSpy('warn()'),
            error: jasmine.createSpy('error()')
        };
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
        spyOn(requestUtils, 'makeSignedRequest').and.callFake(function(creds, method, options) {
            switch(options.url) {
            case 'http://hostname/api/auth/login':
                return Q.resolve();
            case 'http://hostname/api/campaigns/c-123':
                return Q.resolve(mockCampaignResponse);
            }
        });
        spyOn(logger, 'getLog').and.returnValue(mockLog);
    });

    it('should not attempt anything when not provided a campaign', function(done) {
        var mockDatas = [
            { },
            { campaign: { } },
            { campaign: { id: null } }
        ];
        Q.all(mockDatas.map(function(mockData) {
            return setStatus(mockData, mockOptions, mockConfig);
        })).then(function() {
            expect(requestUtils.makeSignedRequest).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
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
        setStatus(mockData, mockOptions, mockConfig).then(function() {
            expect(requestUtils.makeSignedRequest).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });

    describe('when provided a campaign', function() {
        beforeEach(function() {
            mockData = {
                campaign: {
                    id: 'c-123'
                }
            };
            mockOptions = {
                status: 'status'
            };
            mockCampaignResponse = {
                response: {
                    statusCode: 500
                }
            };
        });

        it('should edit the status of the campaign', function(done) {
            setStatus(mockData, mockOptions, mockConfig).then(function() {
                expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith({
                    key: 'key',
                    secret: 'secret'
                }, 'put', {
                    url: 'http://hostname/api/campaigns/c-123',
                    json: {
                        status: 'status'
                    }
                });
                done();
            }).catch(done.fail);
        });

        it('should warn if editing the campaign failed', function(done) {
            setStatus(mockData, mockOptions, mockConfig).then(function() {
                expect(mockLog.warn).toHaveBeenCalled();
                done();
            }).catch(done.fail);
        });
    });
});
