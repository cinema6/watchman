'use strict';

var JsonProducer = require('../../src/producers/JsonProducer.js');
var Q = require('q');
var fetchCampaigns = require('../../src/actions/fetch_campaigns.js');
var logger = require('cwrx/lib/logger.js');
var requestUtils = require('cwrx/lib/requestUtils.js');

describe('fetch_campaigns.js', function() {
    var mockAnalyticsResponse;
    var mockCampaignResponse;
    var mockData;
    var mockOptions;
    var mockConfig;
    var mockLog;
    var mockCampaigns;
    var mockAnalytics;
    
    beforeEach(function() {
        mockData = { };
        mockOptions = {
            statuses: ['status1','status2'],
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
                    },
                    analytics: {
                        endpoint: '/api/analytics'
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
        mockCampaigns = [
            { id: 'cam-1' },
            { id: 'cam-2' },
            { id: 'cam-3' }
        ];
        mockAnalytics = [
            { views: 100 },
            { views: 200 },
            { views: 300 }
        ];
        spyOn(requestUtils, 'qRequest').and.callFake(function(method, options) {
            switch(options.url) {
            case 'http://hostname/api/auth/login':
                return Q.resolve();
            case 'http://hostname/api/campaigns':
                return Q.resolve(mockCampaignResponse);
            case 'http://hostname/api/analytics/campaigns':
                return Q.resolve(mockAnalyticsResponse);
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
                    statuses: 'status1,status2'
                }
            });
            done();
        }).catch(function(error) {
            done.fail(error);
        });
    });
    
    describe('the request for campaigns', function() {
        describe('when it responded with a status code of 200', function() {
            beforeEach(function() {
                mockCampaignResponse = {
                    response: {
                        statusCode: 200
                    },
                    body: mockCampaigns
                };
                JsonProducer.prototype.produce.and.returnValue(Q.resolve());
            });
            
            describe('when analytics are set to be fetched', function() {
                beforeEach(function() {
                    mockOptions.analytics = true;
                    mockAnalyticsResponse = {
                        response: {
                            statusCode: 200
                        },
                        body: []
                    };
                });
                
                it('should fetch analytics', function(done) {
                    fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
                        expect(requestUtils.qRequest).toHaveBeenCalledWith('get', {
                            url: 'http://hostname/api/analytics/campaigns',
                            json: true,
                            jar: true,
                            qs: {
                                ids: 'cam-1,cam-2,cam-3'
                            }
                        });
                        done();
                    }).catch(done.fail);
                });

                describe('when the request for analytics succeeds', function() {
                    beforeEach(function() {
                        mockAnalyticsResponse = {
                            response: {
                                statusCode: 200
                            },
                            body: mockAnalytics
                        };
                    });
                    
                    it('should produce campaigns with analytics into a stream', function(done) {
                        fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
                            mockCampaigns.forEach(function(mockCampaign, index) {
                                expect(JsonProducer.prototype.produce).toHaveBeenCalledWith({
                                    type: 'prefix_campaignPulse',
                                    data: {
                                        campaign: mockCampaign,
                                        analytics: mockAnalytics[index]
                                    }
                                });
                            });
                            done();
                        }).catch(done.fail);
                    });
                });
                
                describe('when the request for analytics fails', function() {
                    beforeEach(function() {
                        mockAnalyticsResponse = {
                            response: {
                                statusCode: 500
                            }
                        };
                    });
                    
                    it('should produce campaigns without analytics into a stream', function(done) {
                        fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
                            mockCampaigns.forEach(function(mockCampaign) {
                                expect(JsonProducer.prototype.produce).toHaveBeenCalledWith({
                                    type: 'prefix_campaignPulse',
                                    data: {
                                        campaign: mockCampaign
                                    }
                                });
                            });
                            done();
                        }).catch(done);
                    });
                    
                    it('should log a warning', function(done) {
                        fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
                            expect(mockLog.warn).toHaveBeenCalled();
                            done();
                        }).catch(done);
                    });
                });
            });
            
            describe('when analytics are not set to be fetched', function() {
                beforeEach(function() {
                    mockOptions.analytics = false;
                });
                
                it('should not fetch analytics', function(done) {
                    fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
                        expect(requestUtils.qRequest.calls.allArgs().map(function(args) {
                            return args[1].url;
                        })).not.toContain('http://hostname/api/analytics/campaigns');
                        done();
                    }).catch(done.fail);
                });

                it('should produce each campaign into a stream', function(done) {
                    fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
                        mockCampaigns.forEach(function(mockCampaign) {
                            expect(JsonProducer.prototype.produce).toHaveBeenCalledWith({
                                type: 'prefix_campaignPulse',
                                data: {
                                    campaign: mockCampaign
                                }
                            });
                        });
                        done();
                    }).catch(done.fail);
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
