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
            },
            appCreds: {
                key: 'key',
                secret: 'secret'
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
            { campaignId: 'cam-3', views: 300 },
            { campaignId: 'cam-2', views: 200 },
            { campaignId: 'cam-1', views: 100 }
        ];
        spyOn(requestUtils, 'makeSignedRequest').and.callFake(function(creds, method, options) {
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

    function getMockAnalyticsForId(id) {
        for(var i=0;i<mockAnalytics.length;i++) {
            if(mockAnalytics[i].campaignId === id) {
                return mockAnalytics[i];
            }
        }
        return null;
    }

    it('should request campaigns', function(done) {
        mockCampaignResponse = {
            response: {
                statusCode: 200
            },
            body: []
        };
        fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
            expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith({
                key: 'key',
                secret: 'secret'
            }, 'get', {
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
                        expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith({
                            key: 'key',
                            secret: 'secret'
                        }, 'get', {
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
                            mockCampaigns.forEach(function(mockCampaign) {
                                expect(JsonProducer.prototype.produce).toHaveBeenCalledWith({
                                    type: 'prefix_campaignPulse',
                                    data: {
                                        campaign: mockCampaign,
                                        analytics: getMockAnalyticsForId(mockCampaign.id)
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
                        expect(requestUtils.makeSignedRequest.calls.allArgs().map(function(args) {
                            return args[2].url;
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
                body: mockCampaigns
            };
        });

        describe('when some fail to be produced', function() {
            beforeEach(function(done) {
                JsonProducer.prototype.produce.and.callFake(function(object) {
                    if(object.data.campaign === mockCampaigns[0]) {
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
