'use strict';

var Q = require('q');
var endCampaign = require('../../src/actions/end_campaign.js');
var logger = require('cwrx/lib/logger.js');
var requestUtils = require('cwrx/lib/requestUtils.js');

describe('end_campaign.js', function() {
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
            }
        };
        spyOn(requestUtils, 'qRequest').and.callFake(function(method, options) {
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
            return endCampaign(mockData, mockOptions, mockConfig);
        })).then(function() {
            expect(requestUtils.qRequest).not.toHaveBeenCalled();
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
            mockCampaignResponse = {
                response: {
                    statusCode: 500
                }
            };
        });
        
        it('should authenticate', function(done) {
            endCampaign(mockData, mockOptions, mockConfig).then(function() {
                expect(requestUtils.qRequest).toHaveBeenCalledWith('post', {
                    url: 'http://hostname/api/auth/login',
                    json: {
                        email: 'email',
                        password: 'password'
                    },
                    jar: true
                });
                done();
            }).catch(done.fail);
        });
        
        it('should edit the status of the campaign', function(done) {
            endCampaign(mockData, mockOptions, mockConfig).then(function() {
                expect(requestUtils.qRequest).toHaveBeenCalledWith('put', {
                    url: 'http://hostname/api/campaigns/c-123',
                    json: {
                        status: 'expired'
                    },
                    jar: true
                });
                done();
            }).catch(done.fail);
        });

        it('should warn if editing the campaign failed', function(done) {
            endCampaign(mockData, mockOptions, mockConfig).then(function() {
                expect(mockLog.warn).toHaveBeenCalled();
                done();
            }).catch(done.fail);
        });
    });
});
