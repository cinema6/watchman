'use strict';

var JsonProducer = require('../../src/producers/JsonProducer.js');
var Q = require('q');
var fetchCampaigns = require('../../src/actions/fetch_campaigns.js');
var logger = require('cwrx/lib/logger.js');
var requestUtils = require('cwrx/lib/requestUtils.js');

describe('fetch_campaigns.js', function() {
    var mockCampaignResponse;
    var mockData;
    var mockOptions;
    var mockConfig;
    var mockLog;
    
    beforeEach(function() {
        mockData = { };
        mockOptions = {
            status: 'status',
            prefix: 'prefix'
        };
        mockConfig = {
            kinesis: {
                producer: {
                    stream: 'stream'
                }
            },
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
        mockLog = {
            trace: jasmine.createSpy('trace()'),
            info: jasmine.createSpy('info()'),
            warn: jasmine.createSpy('warn()'),
            error: jasmine.createSpy('error()')
        };
        spyOn(requestUtils, 'qRequest').and.callFake(function(method, options) {
            switch(options.url) {
            case 'http://hostname/api/auth/login':
                return Q.resolve();
            case 'http://hostname/api/campaigns':
                return Q.resolve(mockCampaignResponse);
            }
        });
        spyOn(JsonProducer.prototype, 'produce');
        spyOn(logger, 'getLog').and.returnValue(mockLog);
    });
    
    it('should authenticate', function(done) {
        mockCampaignResponse = {
            response: {
                statusCode: 200
            },
            body: []
        };
        fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
            expect(requestUtils.qRequest).toHaveBeenCalledWith('post', {
                url: 'http://hostname/api/auth/login',
                json: {
                    email: 'email',
                    password: 'password'
                },
                jar: true
            });
            done();
        }).catch(function(error) {
            done.fail(error);
        });
    });
    
    it('should request campaigns', function(done) {
        mockCampaignResponse = {
            response: {
                statusCode: 200
            },
            body: []
        };
        fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
            expect(requestUtils.qRequest).toHaveBeenCalledWith('get', {
                url: 'http://hostname/api/campaigns',
                json: true,
                jar: true,
                qs: {
                    statuses: 'status'
                }
            });
            done();
        }).catch(function(error) {
            done.fail(error);
        });
    });
    
    describe('the request for campaigns', function() {
        describe('when it responded with a status code of 200', function() {
            beforeEach(function(done) {
                mockCampaignResponse = {
                    response: {
                        statusCode: 200
                    },
                    body: ['cam-1', 'cam-2', 'cam-3']
                };
                JsonProducer.prototype.produce.and.returnValue(Q.resolve());
                fetchCampaigns(mockData, mockOptions, mockConfig).then(done).catch(function(error) {
                    done.fail(error);
                });
            });
            
            it('should produce each campaign into a stream', function() {
                ['cam-1', 'cam-2', 'cam-3'].forEach(function(campaign) {
                    expect(JsonProducer.prototype.produce).toHaveBeenCalledWith({
                        type: 'prefix_campaignPulse',
                        data: {
                            campaign: campaign
                        }
                    });
                });
            });
        });
        
        describe('when it does not respond with a status code of 200', function() {
            beforeEach(function(done) {
                mockCampaignResponse = {
                    response: {
                        statusCode: 500
                    },
                    body: 'epic fail'
                };
                fetchCampaigns(mockData, mockOptions, mockConfig).then(done).catch(function(error) {
                    done.fail(error);
                });
            });
            
            it('should log a warning', function() {
                expect(mockLog.warn).toHaveBeenCalled();
            });
        });
    });
    
    describe('producing campaigns into a stream', function() {
        beforeEach(function() {
            mockCampaignResponse = {
                response: {
                    statusCode: 200
                },
                body: ['cam-1', 'cam-2', 'cam-3']
            };
        });
        
        describe('when some fail to be produced', function() {
            beforeEach(function(done) {
                JsonProducer.prototype.produce.and.callFake(function(object) {
                    if(object.data.campaign === 'cam-1') {
                        return Q.resolve();
                    } else {
                        return Q.reject();
                    }
                });
                fetchCampaigns(mockData, mockOptions, mockConfig).then(done).catch(function(error) {
                    done.fail(error);
                });
            });
            
            it('should log a warning for them', function() {
                expect(mockLog.warn.calls.count()).toBe(2);
            });
        });
    });
});