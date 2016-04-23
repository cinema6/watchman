'use strict';

var q               = require('q');
var util            = require('util');
var rcKinesis       = require('rc-kinesis');
var logger          = require('cwrx/lib/logger.js');
var requestUtils    = require('cwrx/lib/requestUtils');
var Status          = require('cwrx/lib/enums').Status;
var actionFactory   = require('../../src/actions/check_signup_promotion.js');

var FAKE_NOW = new Date('2016-02-10T17:25:38.555Z');

function series(fns) {
    return fns.reduce(function(promise, fn) {
        return promise.then(fn);
    }, q());
}

describe('check_signup_promotion.js', function() {
    var mockOptions, mockConfig, mockLog, mockProducer, event, mockOrg, mockPromotion,
        resps, checkSignupProm;

    beforeEach(function() {
        jasmine.clock().install();
        jasmine.clock().mockDate(FAKE_NOW);
    });
    
    afterEach(function() {
        jasmine.clock().uninstall();
    });

    beforeEach(function() {
        mockOptions = { };
        mockConfig = {
            appCreds: 'i am watchman',
            cwrx: {
                api: {
                    root: 'http://test.com',
                    promotions: {
                        endpoint: '/api/promotions',
                    },
                    orgs: {
                        endpoint: '/api/account/orgs'
                    }
                }
            },
            kinesis: {
                producer: {
                    stream: 'UTStream'
                }
            },
            promotions: [
                { type: 'signupReward', fulfillImmediately: true },
                { type: 'freeTrial', fulfillImmediately: false }
            ]
        };
        event = { data: { user: {
            id: 'u-1',
            org: 'o-1',
            promotion: 'pro-signup-1',
            status: 'active'
        } } };
        
        mockLog = {
            trace : jasmine.createSpy('log.trace'),
            error : jasmine.createSpy('log.error'),
            warn  : jasmine.createSpy('log.warn'),
            info  : jasmine.createSpy('log.info'),
            fatal : jasmine.createSpy('log.fatal'),
            log   : jasmine.createSpy('log.log')
        };
        spyOn(logger, 'getLog').and.returnValue(mockLog);

        mockProducer = {
            produce: jasmine.createSpy('producer.produce()').and.returnValue(q({ success: 'yes' }))
        };
        spyOn(rcKinesis, 'JsonProducer').and.returnValue(mockProducer);

        mockOrg = {
            id: 'o-1',
            name: 'test org',
            promotions: [{
                id: 'pro-1',
                status: Status.Active,
                created: new Date('2016-04-07T19:39:43.671Z'),
                lastUpdated: new Date('2016-04-12T21:47:31.554Z')
            }]
        };
        mockPromotion = {
            id: 'pro-signup-1',
            type: 'signupReward',
            status: Status.Active,
            data: { rewardAmount: 50 }
        };
        resps = {
            orgs: {
                get: { response: { statusCode: 200 }, body: mockOrg },
                put: { response: { statusCode: 200 }, body: mockOrg },
            },
            promotions: {
                get: { response: { statusCode: 200 }, body: mockPromotion }
            }
        };
        
        spyOn(requestUtils, 'makeSignedRequest').and.callFake(function(creds, method, opts) {
            if (/orgs/.test(opts.url)) {
                return q(resps.orgs[method]);
            } else {
                return q(resps.promotions[method]);
            }
        });
        
        checkSignupProm = actionFactory(mockConfig);
    });

    it('should skip if the event contains no user or the user has no promotion', function(done) {
        q.all([{}, { user: { id: 'u-1' } }].map(function(data) {
            event.data = data;
            return checkSignupProm(event);
        }))
        .then(function() {
            expect(requestUtils.makeSignedRequest).not.toHaveBeenCalled();
            expect(mockProducer.produce).not.toHaveBeenCalled();
            expect(mockLog.warn).not.toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });

    it('should update the org and produce a promotionFulfilled event', function(done) {
        var expectedArr = [
            {
                id: 'pro-1',
                status: Status.Active,
                created: new Date('2016-04-07T19:39:43.671Z'),
                lastUpdated: new Date('2016-04-12T21:47:31.554Z')
            },
            {
                id: 'pro-signup-1',
                status: Status.Active,
                created: FAKE_NOW,
                lastUpdated: FAKE_NOW
            }
        ];

        checkSignupProm(event).then(function() {
            expect(rcKinesis.JsonProducer)
                .toHaveBeenCalledWith('UTStream', mockConfig.kinesis.producer);
            expect(requestUtils.makeSignedRequest.calls.count()).toBe(3);
            expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith('i am watchman', 'get', {
                url: 'http://test.com/api/account/orgs/o-1'
            });
            expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith('i am watchman', 'get', {
                url: 'http://test.com/api/promotions/pro-signup-1'
            });
            expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith('i am watchman', 'put', {
                url: 'http://test.com/api/account/orgs/o-1',
                json: { id: 'o-1', name: 'test org', promotions: expectedArr }
            });
            expect(mockProducer.produce).toHaveBeenCalledWith({
                type: 'promotionFulfilled',
                data: {
                    promotion: mockPromotion,
                    org: { id: 'o-1', name: 'test org', promotions: expectedArr }
                }
            });
            expect(mockLog.warn).not.toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });
    
    it('should initialize the promotions array if not defined on the org', function(done) {
        var expectedArr = [{
            id: 'pro-signup-1',
            status: Status.Active,
            created: FAKE_NOW,
            lastUpdated: FAKE_NOW
        }];

        delete mockOrg.promotions;
        checkSignupProm(event).then(function() {
            expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith('i am watchman', 'put', {
                url: 'http://test.com/api/account/orgs/o-1',
                json: jasmine.objectContaining({ promotions: expectedArr })
            });
            expect(mockProducer.produce).toHaveBeenCalledWith({
                type: 'promotionFulfilled',
                data: {
                    promotion: mockPromotion,
                    org: jasmine.objectContaining({ promotions: expectedArr })
                }
            });
            expect(mockLog.warn).not.toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });
    
    it('should warn and skip if the promotion is invalid', function(done) {
        mockPromotion.status = Status.Inactive;
        checkSignupProm(event).then(function() {
            expect(requestUtils.makeSignedRequest.calls.count()).toBe(2);
            expect(requestUtils.makeSignedRequest)
                .not.toHaveBeenCalledWith('i am watchman', 'put', jasmine.any(Object));
            expect(mockLog.warn).toHaveBeenCalled();
            
            requestUtils.makeSignedRequest.calls.reset();
            mockLog.warn.calls.reset();
            mockPromotion.status = Status.Active;
            mockPromotion.type = 'loyaltyReward';
            return checkSignupProm(event);
        }).then(function() {
            expect(requestUtils.makeSignedRequest.calls.count()).toBe(2);
            expect(requestUtils.makeSignedRequest)
                .not.toHaveBeenCalledWith('i am watchman', 'put', jasmine.any(Object));
            expect(mockLog.warn).toHaveBeenCalled();
            expect(mockProducer.produce).not.toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });
    
    it('should warn and skip if the org already has the promotion', function(done) {
        mockOrg.promotions[0].id = event.data.user.promotion;
        checkSignupProm(event).then(function() {
            expect(requestUtils.makeSignedRequest.calls.count()).toBe(2);
            expect(requestUtils.makeSignedRequest)
                .not.toHaveBeenCalledWith('i am watchman', 'put', jasmine.any(Object));
            expect(mockProducer.produce).not.toHaveBeenCalled();
            expect(mockLog.warn).toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });

    it('should not skip if the promotion type is recognized', function(done) {
        series(mockConfig.promotions.map(function(promotionConfig) {
            return function() {
                mockPromotion.status = Status.Active;
                delete mockOrg.promotions;
                requestUtils.makeSignedRequest.calls.reset();
                mockPromotion.type = promotionConfig.type;

                return checkSignupProm(event).then(function() {
                    expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith('i am watchman', 'put', jasmine.any(Object));
                    expect(requestUtils.makeSignedRequest.calls.count()).toBe(3, 'Not enough request were made for promotion type "' + promotionConfig.type + '"');
                });
            };
        })).then(done, done.fail);
    });

    it('should not produce a record is fulfillImmediately is false', function(done) {
        mockPromotion.status = Status.Active;
        delete mockOrg.promotions;
        mockPromotion.type = 'freeTrial';
        mockProducer.produce.calls.reset();

        checkSignupProm(event).then(function() {
            expect(mockProducer.produce).not.toHaveBeenCalled();
        }).then(done, done.fail);
    });
    
    it('should warn and skip if fetching the promotion returns a 4xx', function(done) {
        resps.promotions.get = {
            response: { statusCode: 404 },
            body: 'dat aint real'
        };
        
        checkSignupProm(event).then(function() {
            expect(requestUtils.makeSignedRequest.calls.count()).toBe(2);
            expect(requestUtils.makeSignedRequest)
                .not.toHaveBeenCalledWith('i am watchman', 'put', jasmine.any(Object));
            expect(mockProducer.produce).not.toHaveBeenCalled();
            expect(mockLog.warn).toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });
    
    ['get', 'put'].forEach(function(verb) {
        var reqStr = verb.toUpperCase() + ' /orgs';

        it('should log an error if the ' + reqStr + ' request returns a 4xx', function(done) {
            resps.orgs[verb] = {
                response: { statusCode: 400 },
                body: 'I got a problem with YOU'
            };
            
            checkSignupProm(event).then(function() {
                if (verb === 'get') {
                    expect(requestUtils.makeSignedRequest)
                        .not.toHaveBeenCalledWith('i am watchman', 'put', jasmine.any(Object));
                }
                expect(mockLog.error).toHaveBeenCalled();
                expect(mockLog.error.calls.mostRecent().args).toContain(util.inspect({
                    message: util.format('Error %s org', (verb === 'get' ? 'fetching' : 'editing')),
                    reason: {
                        code: 400,
                        body: 'I got a problem with YOU'
                    }
                }));
                done();
            }).catch(done.fail);
        });
    });
    
    [{ obj: 'orgs', verb: 'get' }, { obj: 'orgs', verb: 'put' }, { obj: 'promotions', verb: 'get' }]
    .forEach(function(cfg) {
        var reqStr = cfg.verb.toUpperCase() + ' /' + cfg.obj;

        it('should log an error if the ' + reqStr + ' request rejects', function(done) {
            resps[cfg.obj][cfg.verb] = q.reject('WHO WATCHES THE WATCHMAN');

            checkSignupProm(event).then(function() {
                if (cfg.verb === 'get') {
                    expect(requestUtils.makeSignedRequest)
                        .not.toHaveBeenCalledWith('i am watchman', 'put', jasmine.any(Object));
                }
                expect(mockLog.error).toHaveBeenCalled();
                expect(mockLog.error.calls.mostRecent().args)
                    .toContain(util.inspect('WHO WATCHES THE WATCHMAN'));
                done();
            }).catch(done.fail);
        });
    });

    it('should log an error if producing the promotionFulfilled event fails', function(done) {
        mockProducer.produce.and.returnValue(q.reject('I GOT A PROBLEM'));
        checkSignupProm(event).then(function() {
            expect(mockLog.error).toHaveBeenCalled();
            expect(mockLog.error.calls.mostRecent().args)
                .toContain(util.inspect('I GOT A PROBLEM'));
            done();
        }).catch(done.fail);
    });
});
