'use strict';

var q               = require('q');
var util            = require('util');
var logger          = require('cwrx/lib/logger.js');
var requestUtils    = require('cwrx/lib/requestUtils');
var actionFactory   = require('../../src/actions/fulfill_promotion.js');

describe('check_signup_promotion.js', function() {
    var mockOptions, mockConfig, mockLog, event, transResp, fulfillProm;

    beforeEach(function() {
        mockOptions = { };
        mockConfig = {
            appCreds: 'i am watchman',
            cwrx: {
                api: {
                    root: 'http://test.com',
                    transactions: {
                        endpoint: '/api/transactions/',
                    }
                }
            }
        };
        event = {
            data: {
                org: {
                    id: 'o-1',
                    status: 'active',
                    promotions: [{ id: 'pro-1', date: new Date('2016-04-07T19:39:43.671Z') }],
                },
                promotion: {
                    id: 'pro-1',
                    type: 'signupReward',
                    data: { rewardAmount: 50 }
                }
            }
        };
        
        mockLog = {
            trace : jasmine.createSpy('log.trace'),
            error : jasmine.createSpy('log.error'),
            warn  : jasmine.createSpy('log.warn'),
            info  : jasmine.createSpy('log.info'),
            fatal : jasmine.createSpy('log.fatal'),
            log   : jasmine.createSpy('log.log')
        };
        spyOn(logger, 'getLog').and.returnValue(mockLog);

        transResp = {
            response: { statusCode: 201 },
            body: {
                id: 't-1',
                amount: 50.00,
                promotion: 'pro-1'
            }
        };
        
        spyOn(requestUtils, 'makeSignedRequest').and.callFake(function(creds, method, opts) {
            return q(transResp);
        });
        
        fulfillProm = actionFactory(mockConfig);
    });

    it('should skip if the event contains no org or promotion', function(done) {
        q.all([{}, { org: event.data.org }, { promotion: event.data.promotion }].map(function(data) {
            event.data = data;
            return fulfillProm(event);
        }))
        .then(function() {
            expect(requestUtils.makeSignedRequest).not.toHaveBeenCalled();
            expect(mockLog.warn).not.toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });

    it('should create a credit transaction', function(done) {
        fulfillProm(event).then(function() {
            expect(requestUtils.makeSignedRequest).toHaveBeenCalledWith('i am watchman', 'post', {
                url: 'http://test.com/api/transactions/',
                json: {
                    amount: 50,
                    org: 'o-1',
                    promotion: 'pro-1'
                }
            });
            expect(mockLog.warn).not.toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });
    
    it('should warn and skip if the promotion type is unrecognized', function(done) {
        event.data.promotion.type = 'freeee money';
        fulfillProm(event).then(function() {
            expect(requestUtils.makeSignedRequest).not.toHaveBeenCalled();
            expect(mockLog.warn).toHaveBeenCalled();
            expect(mockLog.error).not.toHaveBeenCalled();
            done();
        }).catch(done.fail);
    });

    it('should log an error if creating the transaction returns a 4xx', function(done) {
        transResp = { response: { statusCode: 400 }, body: 'I got a problem with YOU' };
        fulfillProm(event).then(function() {
            expect(mockLog.error).toHaveBeenCalled();
            expect(mockLog.error.calls.mostRecent().args).toContain(util.inspect({
                message: 'Error creating transaction',
                reason: {
                    code: 400,
                    body: 'I got a problem with YOU'
                }
            }));
            done();
        }).catch(done.fail);
    });

    it('should log an error if creating the transaction rejects', function(done) {
        transResp = q.reject('I GOT A PROBLEM');
        fulfillProm(event).then(function() {
            expect(mockLog.error).toHaveBeenCalled();
            expect(mockLog.error.calls.mostRecent().args).toContain(util.inspect('I GOT A PROBLEM'));
            done();
        }).catch(done.fail);
    });
});
