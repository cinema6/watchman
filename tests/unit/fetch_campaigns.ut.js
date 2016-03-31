'use strict';

var JsonProducer = require('rc-kinesis').JsonProducer;
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
            prefix: 'prefix',
            number: 2
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
            case 'http://hostname/api/campaigns':
                return Q.resolve(mockCampaignResponse);
            case 'http://hostname/api/analytics/campaigns':
                return Q.resolve(mockAnalyticsResponse);
            }
        });
        spyOn(JsonProducer.prototype, 'produce');
        spyOn(logger, 'getLog').and.returnValue(mockLog);
        spyOn(fetchCampaigns.__private__, 'getRequest');
        spyOn(fetchCampaigns.__private__, 'getNumCampaigns');
        spyOn(fetchCampaigns.__private__, 'getCampaigns');
        spyOn(fetchCampaigns.__private__, 'getAnalytics');
        spyOn(fetchCampaigns.__private__, 'produceResults');
    });

    function getMockAnalyticsForId(id) {
        for(var i=0;i<mockAnalytics.length;i++) {
            if(mockAnalytics[i].campaignId === id) {
                return mockAnalytics[i];
            }
        }
        return null;
    }

    describe('getRequest', function() {
        var getRequest;

        beforeEach(function() {
            getRequest = fetchCampaigns.__private__.getRequest;
            getRequest.and.callThrough();
        });

        it('should make a signed request', function(done) {
            mockCampaignResponse = {
                response: {
                    statusCode: 200
                },
                body: mockCampaigns
            };
            getRequest('creds', 'http://hostname/api/campaigns', 'query').then(function() {
                expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith('creds', 'get', {
                    url: 'http://hostname/api/campaigns',
                    json: true,
                    qs: 'query'
                });
                done();
            }).catch(done.fail);
        });

        it('should be able to resolve with the response object', function(done) {
            mockCampaignResponse = {
                response: {
                    statusCode: 200
                },
                body: mockCampaigns
            };
            getRequest('creds', 'http://hostname/api/campaigns', 'query').then(function(response) {
                expect(response).toEqual(mockCampaignResponse);
                done();
            }).catch(done.fail);
        });

        it('should reject if the response does not have a status code of 200', function(done) {
            mockCampaignResponse = {
                response: {
                    statusCode: 500
                },
                body: 'epic fail'
            };
            getRequest('creds', 'http://hostname/api/campaigns', 'query').then(done.fail)
                .catch(function(error) {
                    expect(error).toContain('epic fail');
                    expect(mockLog.warn).toHaveBeenCalled();
                    done();
                });
        });
    });

    describe('getCampaigns', function() {
        var getCampaigns;

        beforeEach(function() {
            getCampaigns = fetchCampaigns.__private__.getCampaigns;
            getCampaigns.and.callThrough();
        });

        it('should perform a get request', function(done) {
            var mockResponse = {
                response: {
                    statusCode: 200
                },
                body: mockCampaigns
            };
            fetchCampaigns.__private__.getRequest.and.returnValue(Q.resolve(mockResponse));
            getCampaigns('creds', 'endpoint', 'query').then(function() {
                expect(fetchCampaigns.__private__.getRequest).toHaveBeenCalledWith('creds',
                    'endpoint', 'query');
                done();
            }).catch(done.fail);
        });

        it('should be able to resolve with a campaign data object', function(done) {
            var mockResponse = {
                response: {
                    statusCode: 200
                },
                body: mockCampaigns
            };
            fetchCampaigns.__private__.getRequest.and.returnValue(Q.resolve(mockResponse));
            getCampaigns('creds', 'endpoint', 'query').then(function(campData) {
                expect(campData).toEqual({
                    'cam-1': {
                        campaign: mockCampaigns[0]
                    },
                    'cam-2': {
                        campaign: mockCampaigns[1]
                    },
                    'cam-3': {
                        campaign: mockCampaigns[2]
                    }
                });
                done();
            }).catch(done.fail);
        });

        it('should reject if the get request fails', function(done) {
            fetchCampaigns.__private__.getRequest.and.returnValue(Q.reject('epic fail'));
            getCampaigns('creds', 'endpoint', 'query').then(done.fail).catch(function(error) {
                expect(error).toBe('epic fail');
                done();
            });
        });
    });


    describe('getAnalytics', function() {
        var getAnalytics;

        beforeEach(function() {
            getAnalytics = fetchCampaigns.__private__.getAnalytics;
            getAnalytics.and.callThrough();
        });

        it('should resolve with the campaign data if it contains no campaigns', function(done) {
            var campData = { };
            getAnalytics(campData, 'creds', 'endpoint').then(function(newData) {
                expect(newData).toEqual(campData);
                done();
            }).catch(done.fail);
        });

        it('should perform a get request to get analytics', function(done) {
            var campData = {
                'cam-1': {
                    campaign: mockCampaigns[0]
                },
                'cam-2': {
                    campaign: mockCampaigns[1]
                },
                'cam-3': {
                    campaign: mockCampaigns[2]
                }
            };
            mockAnalyticsResponse = {
                body: []
            };
            fetchCampaigns.__private__.getRequest.and.returnValue(Q.resolve(mockAnalyticsResponse));
            getAnalytics(campData, 'creds', 'endpoint').then(function() {
                expect(fetchCampaigns.__private__.getRequest).toHaveBeenCalledWith('creds',
                    'endpoint', { ids: 'cam-1,cam-2,cam-3' });
                done();
            }).catch(done.fail);
        });

        it('should be able to resolve with populated campaign data', function(done) {
            var campData = {
                'cam-1': {
                    campaign: mockCampaigns[0]
                },
                'cam-2': {
                    campaign: mockCampaigns[1]
                },
                'cam-3': {
                    campaign: mockCampaigns[2]
                }
            };
            mockAnalyticsResponse = {
                body: mockAnalytics
            };
            fetchCampaigns.__private__.getRequest.and.returnValue(Q.resolve(mockAnalyticsResponse));
            getAnalytics(campData, 'creds', 'endpoint').then(function(newData) {
                expect(newData).toEqual({
                    'cam-1': {
                        campaign: mockCampaigns[0],
                        analytics: getMockAnalyticsForId('cam-1')
                    },
                    'cam-2': {
                        campaign: mockCampaigns[1],
                        analytics: getMockAnalyticsForId('cam-2')
                    },
                    'cam-3': {
                        campaign: mockCampaigns[2],
                        analytics: getMockAnalyticsForId('cam-3')
                    }
                });
                done();
            }).catch(done.fail);
        });

        it('should reject if the get request fails', function(done) {
            var campData = {
                'cam-1': {
                    campaign: mockCampaigns[0]
                },
                'cam-2': {
                    campaign: mockCampaigns[1]
                },
                'cam-3': {
                    campaign: mockCampaigns[2]
                }
            };
            fetchCampaigns.__private__.getRequest.and.returnValue(Q.reject('epic fail'));
            getAnalytics(campData, 'creds', 'endpoint').then(done.fail).catch(function(error) {
                expect(error).toBe('epic fail');
                done();
            });
        });
    });

    describe('produce results', function() {
        var produceResults;
        var mockProducer;

        beforeEach(function() {
            produceResults = fetchCampaigns.__private__.produceResults;
            produceResults.and.callThrough();
            mockProducer = new JsonProducer();
        });

        it('should properly call the produce method on the producer', function(done) {
            var campData = {
                'cam-1': {
                    campaign: mockCampaigns[0],
                    analytics: getMockAnalyticsForId('cam-1')
                },
                'cam-2': {
                    campaign: mockCampaigns[1],
                    analytics: getMockAnalyticsForId('cam-2')
                },
                'cam-3': {
                    campaign: mockCampaigns[2],
                    analytics: getMockAnalyticsForId('cam-3')
                }
            };
            produceResults(mockProducer, campData, 'prefix').then(function() {
                ['cam-1', 'cam-2', 'cam-3'].forEach(function(id) {
                    expect(mockProducer.produce).toHaveBeenCalledWith({
                        type: 'prefix_campaignPulse',
                        data: campData[id]
                    });
                });
                done();
            }).catch(done.fail);
        });

        it('should resolve even if the campaigns fail to be produced into the stream',
                function(done) {
            var campData = {
                'cam-1': {
                    campaign: mockCampaigns[0],
                    analytics: getMockAnalyticsForId('cam-1')
                },
                'cam-2': {
                    campaign: mockCampaigns[1],
                    analytics: getMockAnalyticsForId('cam-2')
                },
                'cam-3': {
                    campaign: mockCampaigns[2],
                    analytics: getMockAnalyticsForId('cam-3')
                }
            };
            mockProducer.produce.and.returnValue(Q.reject('epic fail'));
            produceResults(mockProducer, campData, 'prefix').then(function() {
                done();
            }).catch(done.fail);
        });

        it('should log a warning if producing the campaign data fails', function(done) {
            var campData = {
                'cam-1': {
                    campaign: mockCampaigns[0],
                    analytics: getMockAnalyticsForId('cam-1')
                },
                'cam-2': {
                    campaign: mockCampaigns[1],
                    analytics: getMockAnalyticsForId('cam-2')
                },
                'cam-3': {
                    campaign: mockCampaigns[2],
                    analytics: getMockAnalyticsForId('cam-3')
                }
            };
            mockProducer.produce.and.returnValue(Q.reject('epic fail'));
            produceResults(mockProducer, campData, 'prefix').then(function() {
                expect(mockLog.warn.calls.count()).toBe(3);
                done();
            }).catch(done.fail);
        });
    });

    describe('getNumCampaigns', function() {
        var getNumCampaigns;

        beforeEach(function() {
            getNumCampaigns = fetchCampaigns.__private__.getNumCampaigns;
            getNumCampaigns.and.callThrough();
        });

        it('should send a get request', function(done) {
            var mockResponse = {
                response: {
                    headers: {
                        'content-range': '1-1/100'
                    }
                }
            };
            fetchCampaigns.__private__.getRequest.and.returnValue(Q.resolve(mockResponse));
            getNumCampaigns('creds', 'endpoint', ['status1', 'status2']).then(function() {
                expect(fetchCampaigns.__private__.getRequest).toHaveBeenCalledWith('creds',
                    'endpoint', {
                        limit: 1,
                        statuses: 'status1,status2',
                        fields: 'id'
                    });
                done();
            }).catch(done.fail);
        });

        it('should be able to resolve with the total from the content range header',
                function(done) {
            var mockResponse = {
                response: {
                    headers: {
                        'content-range': '1-1/100'
                    }
                }
            };
            fetchCampaigns.__private__.getRequest.and.returnValue(Q.resolve(mockResponse));
            getNumCampaigns('creds', 'endpoint', ['status1', 'status2']).then(function(num) {
                expect(num).toBe(100);
                done();
            }).catch(done.fail);
        });

        it('should reject if the header is unrecognizable', function(done) {
            var mockResponse = {
                response: {
                    headers: {
                        'content-range': 'invalid'
                    }
                }
            };
            fetchCampaigns.__private__.getRequest.and.returnValue(Q.resolve(mockResponse));
            getNumCampaigns('creds', 'endpoint', ['status1', 'status2']).then(done.fail)
                .catch(function(error) {
                    expect(error).toContain('invalid');
                    done();
                });
        });
    });

    describe('the action', function() {
        it('should get the number of campaigns with the given statuses', function(done) {
            fetchCampaigns.__private__.getNumCampaigns.and.returnValue(Q.resolve(0));
            fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
                expect(fetchCampaigns.__private__.getNumCampaigns).toHaveBeenCalledWith(
                    mockConfig.appCreds, 'http://hostname/api/campaigns', ['status1','status2']);
                done();
            }).catch(done.fail);
        });

        it('should make requests to get campaigns and limit the number of campaigns it fetches',
                function(done) {
            fetchCampaigns.__private__.getNumCampaigns.and.returnValue(Q.resolve(5));
            fetchCampaigns.__private__.getCampaigns.and.returnValue(Q.resolve('campData'));
            fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
                expect(fetchCampaigns.__private__.getCampaigns).toHaveBeenCalledWith(
                    mockConfig.appCreds, 'http://hostname/api/campaigns', {
                        limit: 2,
                        skip: 0,
                        statuses: 'status1,status2'
                    });
                expect(fetchCampaigns.__private__.getCampaigns).toHaveBeenCalledWith(
                    mockConfig.appCreds, 'http://hostname/api/campaigns', {
                        limit: 2,
                        skip: 2,
                        statuses: 'status1,status2'
                    });
                expect(fetchCampaigns.__private__.getCampaigns).toHaveBeenCalledWith(
                    mockConfig.appCreds, 'http://hostname/api/campaigns', {
                        limit: 2,
                        skip: 4,
                        statuses: 'status1,status2'
                    });
                expect(fetchCampaigns.__private__.getCampaigns.calls.count()).toBe(3);
                done();
            }).catch(done.fail);
        });

        it('should make requests to get analytics for each campaign request', function(done) {
            fetchCampaigns.__private__.getNumCampaigns.and.returnValue(Q.resolve(5));
            fetchCampaigns.__private__.getCampaigns.and.returnValue(Q.resolve('campData'));
            fetchCampaigns.__private__.getAnalytics.and.returnValue(Q.resolve('populatedCampData'));
            mockOptions.analytics = true;
            fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
                expect(fetchCampaigns.__private__.getAnalytics).toHaveBeenCalledWith('campData',
                    mockConfig.appCreds, 'http://hostname/api/analytics/campaigns');
                expect(fetchCampaigns.__private__.getAnalytics.calls.count()).toBe(3);
                done();
            }).catch(done.fail);
        });

        it('should produce the results of each group of fetched campaigns', function(done) {
            fetchCampaigns.__private__.getNumCampaigns.and.returnValue(Q.resolve(5));
            fetchCampaigns.__private__.getCampaigns.and.returnValue(Q.resolve('campData'));
            fetchCampaigns.__private__.getAnalytics.and.returnValue(Q.resolve('populatedCampData'));
            mockOptions.analytics = true;
            fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
                expect(fetchCampaigns.__private__.produceResults).toHaveBeenCalledWith(
                    jasmine.any(JsonProducer), 'populatedCampData', 'prefix');
                expect(fetchCampaigns.__private__.produceResults.calls.count()).toBe(3);
                done();
            }).catch(done.fail);
        });

        it('should still send some requests if one fails', function(done) {
            fetchCampaigns.__private__.getNumCampaigns.and.returnValue(Q.resolve(5));
            fetchCampaigns.__private__.getCampaigns.and.callFake(function(creds, endpoint, query) {
                if(query.skip === 0) {
                    return Q.resolve('campData');
                } else {
                    return Q.reject();
                }
            });
            fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
                expect(fetchCampaigns.__private__.produceResults).toHaveBeenCalledWith(
                    jasmine.any(JsonProducer), 'campData', 'prefix');
                expect(fetchCampaigns.__private__.produceResults.calls.count()).toBe(1);
                done();
            }).catch(done.fail);
        });

        it('should log a warning if some of the requests failed', function(done) {
            fetchCampaigns.__private__.getNumCampaigns.and.returnValue(Q.resolve(5));
            fetchCampaigns.__private__.getCampaigns.and.callFake(function(creds, endpoint, query) {
                if(query.skip === 0) {
                    return Q.resolve('campData');
                } else {
                    return Q.reject();
                }
            });
            fetchCampaigns(mockData, mockOptions, mockConfig).then(function() {
                expect(mockLog.warn.calls.count()).toBe(2);
                done();
            }).catch(done.fail);
        });
    });
});
