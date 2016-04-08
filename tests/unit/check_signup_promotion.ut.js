'use strict';

var q               = require('q');
var util            = require('util');
var rcKinesis       = require('rc-kinesis');
var logger          = require('cwrx/lib/logger.js');
var requestUtils    = require('cwrx/lib/requestUtils');
var actionFactory   = require('../../src/actions/check_signup_promotion.js');

describe('check_signup_promotion.js', function() {
    var mockOptions, mockConfig, mockLog, mockProducer, event, mockOrg, mockPromotion,
        resps, checkSignupProm;

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
            }
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
            promotions: [
                { id: 'pro-1', date: new Date('2016-04-07T19:39:43.671Z') }
            ]
        };
        mockPromotion = {
            id: 'pro-signup-1',
            type: 'signupReward',
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
                json: {
                    id: 'o-1',
                    name: 'test org',
                    promotions: [
                        { id: 'pro-1', date: new Date('2016-04-07T19:39:43.671Z') },
                        { id: 'pro-signup-1', date: jasmine.any(Date) }
                    ]
                }
            });
            expect(mockProducer.produce).toHaveBeenCalledWith({
                type: 'promotionFulfilled',
                data: {
                    promotion: mockPromotion,
                    org: {
                        id: 'o-1',
                        name: 'test org',
                        promotions: [
                            { id: 'pro-1', date: new Date('2016-04-07T19:39:43.671Z') },
                            { id: 'pro-signup-1', date: jasmine.any(Date) }
                        ]
                    }
                }
            });
            expect(mockLog.warn).not.toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });
    
    it('should initialize the promotions array if not defined on the org', function(done) {
        delete mockOrg.promotions;
        checkSignupProm(event).then(function() {
            expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith('i am watchman', 'put', {
                url: 'http://test.com/api/account/orgs/o-1',
                json: jasmine.objectContaining({
                    promotions: [{ id: 'pro-signup-1', date: jasmine.any(Date) }]
                })
            });
            expect(mockProducer.produce).toHaveBeenCalledWith({
                type: 'promotionFulfilled',
                data: {
                    promotion: mockPromotion,
                    org: jasmine.objectContaining({
                        promotions: [{ id: 'pro-signup-1', date: jasmine.any(Date) }]
                    })
                }
            });
            expect(mockLog.warn).not.toHaveBeenCalled();
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
    
    [{ obj: 'orgs', verb: 'get' }, { obj: 'orgs', verb: 'put' }, { obj: 'promotions', verb: 'get' }]
    .forEach(function(cfg) {
        var reqStr = cfg.verb.toUpperCase() + ' /' + cfg.obj;

        it('should log an error if the ' + reqStr + ' request returns a 4xx', function(done) {
            resps[cfg.obj][cfg.verb] = {
                response: { statusCode: 400 },
                body: 'I got a problem with YOU'
            };
            
            var url = mockConfig.cwrx.api.root + mockConfig.cwrx.api[cfg.obj].endpoint +
                                                 (cfg.obj === 'orgs' ? '/o-1' : '/pro-signup-1');

            checkSignupProm(event).then(function() {
                if (cfg.verb === 'get') {
                    expect(requestUtils.makeSignedRequest)
                        .not.toHaveBeenCalledWith('i am watchman', 'put', jasmine.any(Object));
                }
                expect(mockLog.error).toHaveBeenCalled();
                expect(mockLog.error.calls.mostRecent().args).toContain(util.inspect({
                    message: 'Error calling ' + cfg.verb.toUpperCase() + ' ' + url,
                    reason: {
                        code: 400,
                        body: 'I got a problem with YOU'
                    }
                }));
                done();
            }).catch(done.fail);
        });

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
